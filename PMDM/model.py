# Generated from: mol_(1) (1).ipynb
# Converted at: 2026-04-16T09:06:13.548Z
# Next step (optional): refactor into modules & generate tests with RunCell
# Quick start: pip install runcell

import sys
#!{sys.executable} -m pip install rdkit -q

# !pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu118

#!pip install -q torch_geometric

from rdkit import Chem
from rdkit.Chem import Descriptors
from torch.utils.data import Dataset, DataLoader

#from google.colab import files
# import files
# print("Please zip your dataset folder on your local machine and then upload the .zip file.")
# uploaded = files.upload() # This will open a file picker to upload your zip file

import os
# import zipfile

# Assuming you uploaded a single zip file, get its name
# zip_file_name = list(uploaded.keys())[0]

# Unzip the file
# with zipfile.ZipFile(zip_file_name, 'r') as zip_ref:

#     zip_ref.extractall('.')

# print(f"Successfully unzipped '{zip_file_name}'")
# print("Contents after unzipping:")
#ls -F # List the contents of the current directory to show the unzipped folder

#!pip install biopython

#!ls /content/

from Bio.PDB import PDBParser

import os
import torch
import numpy as np

class PocketLigandDataset(torch.utils.data.Dataset):
    def __init__(self, root_dir, cfg):
        self.cfg = cfg
        self.samples = []

        print("Loading dataset from:", root_dir)

        for folder in os.listdir(root_dir):
            path = os.path.join(root_dir, folder)

            if not os.path.isdir(path):
                continue

            files = os.listdir(path)

            # Find correct files
            pdb_files = [f for f in files if f.endswith("_pocket.pdb")]
            sdf_files = [f for f in files if f.endswith("_ligand.sdf")]

            if not pdb_files or not sdf_files:
                print("Skipping (missing files):", folder)
                continue

            pdb_path = os.path.join(path, pdb_files[0])
            sdf_path = os.path.join(path, sdf_files[0])

            try:
                aa_ids, ca_coords = parse_pocket(pdb_path, sdf_path)
                lig = parse_ligand(sdf_path)
            except Exception as e:
                print("Error in:", folder, "|", e)
                continue

            if lig is None:
                continue

            if len(aa_ids) < 3:
                continue

            # ---- Ligand ----
            coords = lig["coords"]
            atom_types = lig["atom_types"]
            bond_matrix = lig["bond_matrix"]

            N = len(atom_types)
            if N > cfg.max_atoms:
                continue

            # Padding
            padded_coords = np.zeros((cfg.max_atoms, 3), dtype=np.float32)
            padded_atom_types = np.full(cfg.max_atoms, cfg.mask_atom_idx, dtype=np.int64)
            padded_bonds = np.zeros((cfg.max_atoms, cfg.max_atoms), dtype=np.int64)
            atom_mask = np.zeros(cfg.max_atoms, dtype=np.float32)

            padded_coords[:N] = coords
            padded_atom_types[:N] = atom_types
            padded_bonds[:N, :N] = bond_matrix
            atom_mask[:N] = 1.0

            # ---- Pocket ----
            P = min(len(aa_ids), cfg.max_pocket_residues)

            pocket_aa = np.zeros(cfg.max_pocket_residues, dtype=np.int64)
            pocket_ca = np.zeros((cfg.max_pocket_residues, 3), dtype=np.float32)

            pocket_aa[:P] = aa_ids[:P]
            pocket_ca[:P] = ca_coords[:P]

            # ---- Convert to tensors ----
            self.samples.append({
                "coords": torch.tensor(padded_coords, dtype=torch.float32),
                "atom_types": torch.tensor(padded_atom_types, dtype=torch.long),
                "bond_types": torch.tensor(padded_bonds, dtype=torch.long),
                "atom_mask": torch.tensor(atom_mask, dtype=torch.float32),
                "pocket_aa": torch.tensor(pocket_aa, dtype=torch.long),
                "pocket_ca": torch.tensor(pocket_ca, dtype=torch.float32),
            })

        print("Loaded samples:", len(self.samples))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return self.samples[idx]

"""
Protein-Conditioned Dual Diffusion Framework for Structure-Based Drug Discovery
===============================================================================
Colab-ready implementation of a dual diffusion model that jointly generates:
  1. 3D atomic coordinates (continuous diffusion)
  2. Atom types + bond types (discrete/categorical diffusion)

Both processes are conditioned on protein pocket geometry (from PDBBind-style data)
using a shared EGNN backbone.

Usage (Google Colab):
---------------------
!pip install torch torch_geometric rdkit-pypi einops

Then just run all cells or: exec(open("protein_dual_diffusion.py").read())
"""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 0 — Colab Setup
# ─────────────────────────────────────────────────────────────────────────────

INSTALL_CMD = """
!pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu118
!pip install -q torch_geometric
!pip install -q rdkit-pypi einops tqdm pandas
"""
# Paste INSTALL_CMD in a Colab cell first, then run this file.

import os, math, random, warnings, json
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Tuple, Dict

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor

warnings.filterwarnings("ignore")
torch.manual_seed(42)
np.random.seed(42)



# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — Configuration
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DiffusionConfig:
    # Atom vocabulary: H C N O F P S Cl Br I + MASK
    atom_types: List[str] = field(default_factory=lambda: [
        "H", "C", "N", "O", "F", "P", "S", "Cl", "Br", "I", "MASK"
    ])
    # Bond vocabulary: NONE, SINGLE, DOUBLE, TRIPLE, AROMATIC
    bond_types: List[str] = field(default_factory=lambda: [
        "NONE", "SINGLE", "DOUBLE", "TRIPLE", "AROMATIC"
    ])

    # Model dimensions
    node_dim: int = 128
    edge_dim: int = 64
    hidden_dim: int = 256
    num_egnn_layers: int = 6
    pocket_node_dim: int = 64   # protein residue embedding dim

    # Continuous diffusion (coordinates)
    T_coords: int = 1000        # diffusion timesteps for coords
    beta_start: float = 1e-4
    beta_end: float = 0.02

    # Discrete diffusion (atom/bond types)
    T_discrete: int = 1000     # diffusion timesteps for types
    absorbing_state: bool = True  # use absorbing (MASK) diffusion

    # Molecule size
    max_atoms: int = 38         # max atoms per molecule
    max_pocket_residues: int = 30

    # Training
    batch_size: int = 16
    lr: float = 1e-4
    num_epochs: int = 50
    grad_clip: float = 1.0
    lambda_coord: float = 1.0   # coord loss weight
    lambda_atom: float = 1.0    # atom type loss weight
    lambda_bond: float = 0.5    # bond type loss weight

    # Generation
    num_samples: int = 100      # molecules to generate per protein
    sample_steps: int = 250     # DDIM-style steps during sampling
    temperature: float = 0.8

    # Misc
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    save_dir: str = "./outputs"

    @property
    def num_atom_types(self): return len(self.atom_types)
    @property
    def num_bond_types(self): return len(self.bond_types)
    @property
    def mask_atom_idx(self): return self.atom_types.index("MASK")


cfg = DiffusionConfig()
os.makedirs(cfg.save_dir, exist_ok=True)
print(f"Device: {cfg.device}")
print(f"Atom types ({cfg.num_atom_types}): {cfg.atom_types}")
print(f"Bond types ({cfg.num_bond_types}): {cfg.bond_types}")



# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — Noise Schedules
# ─────────────────────────────────────────────────────────────────────────────

class ContinuousNoiseSchedule(nn.Module):
    """Cosine/linear beta schedule for coordinate diffusion (DDPM-style)."""

    def __init__(self, T: int, beta_start: float, beta_end: float, schedule: str = "cosine"):
        super().__init__()
        self.T = T
        if schedule == "cosine":
            betas = self._cosine_schedule(T)
        else:
            betas = torch.linspace(beta_start, beta_end, T)

        alphas = 1.0 - betas
        alpha_bars = torch.cumprod(alphas, dim=0)
        alpha_bars_prev = F.pad(alpha_bars[:-1], (1, 0), value=1.0)

        self.register_buffer("betas", betas)
        self.register_buffer("alphas", alphas)
        self.register_buffer("alpha_bars", alpha_bars)
        self.register_buffer("alpha_bars_prev", alpha_bars_prev)
        self.register_buffer("sqrt_alpha_bars", alpha_bars.sqrt())
        self.register_buffer("sqrt_one_minus_alpha_bars", (1 - alpha_bars).sqrt())
        self.register_buffer("posterior_variance", betas * (1 - alpha_bars_prev) / (1 - alpha_bars))
        self.betas = betas
        self.alphas = alphas
        self.alpha_bars = alpha_bars
        self.alpha_bars_prev = alpha_bars_prev
        self.sqrt_alpha_bars = alpha_bars.sqrt()
        self.sqrt_one_minus_alpha_bars = (1 - alpha_bars).sqrt()
        self.posterior_variance = betas * (1 - alpha_bars_prev) / (1 - alpha_bars)

    def _cosine_schedule(self, T: int, s: float = 0.008) -> Tensor:
        steps = torch.arange(T + 1, dtype=torch.float64)
        f = torch.cos(((steps / T) + s) / (1 + s) * math.pi * 0.5) ** 2
        betas = torch.clip(1 - f[1:] / f[:-1], 0.0001, 0.9999)
        return betas.float()

    def q_sample(self, x0: Tensor, t: Tensor, noise: Optional[Tensor] = None) -> Tensor:
        """Forward diffusion: q(x_t | x_0)"""
        if noise is None:
            noise = torch.randn_like(x0)
        sqrt_ab = self.sqrt_alpha_bars[t].view(-1, 1, 1)
        sqrt_1ab = self.sqrt_one_minus_alpha_bars[t].view(-1, 1, 1)
        return sqrt_ab * x0 + sqrt_1ab * noise

    def predict_x0_from_noise(self, xt: Tensor, t: Tensor, noise_pred: Tensor) -> Tensor:
        sqrt_ab = self.sqrt_alpha_bars[t].view(-1, 1, 1)
        sqrt_1ab = self.sqrt_one_minus_alpha_bars[t].view(-1, 1, 1)
        return (xt - sqrt_1ab * noise_pred) / sqrt_ab

    def ddpm_step(self, xt: Tensor, t: Tensor, noise_pred: Tensor) -> Tensor:
        """Reverse step: p(x_{t-1} | x_t)"""
        beta_t = self.betas[t].view(-1, 1, 1)
        sqrt_1ab = self.sqrt_one_minus_alpha_bars[t].view(-1, 1, 1)
        sqrt_recip_a = (1.0 / self.alphas[t].sqrt()).view(-1, 1, 1)
        mean = sqrt_recip_a * (xt - beta_t / sqrt_1ab * noise_pred)
        var = self.posterior_variance[t].view(-1, 1, 1)
        noise = torch.randn_like(xt) if (t > 0).any() else torch.zeros_like(xt)
        return mean + var.sqrt() * noise


class DiscreteNoiseSchedule(nn.Module):
    """
    Absorbing-state discrete diffusion for atom/bond types.
    At each step, tokens are independently masked with probability beta_t.
    q(x_t | x_{t-1}) = (1 - beta_t) * delta(x_t, x_{t-1}) + beta_t * delta(x_t, MASK)
    """

    def __init__(self, T: int, mask_idx: int, vocab_size: int):
        super().__init__()
        self.T = T
        self.mask_idx = mask_idx
        self.vocab_size = vocab_size

        # Probability of being MASK at time t (cumulative)
        # gamma_t = 1 - prod_{s=1}^{t}(1 - beta_s), linear schedule
        gamma = torch.linspace(0.0, 1.0, T + 1)   # [0, 1]
        self.register_buffer("gamma", gamma)  # gamma[t] = P(masked at step t)

    def q_sample(self, x0: Tensor, t: Tensor) -> Tensor:
        """Forward: mask tokens with probability gamma[t]."""
        # x0: [B, N] integer token indices
        gamma_t = self.gamma[t].to(x0.device)  # [B]

        # Expand gamma_t to match x0 dimensions
        while gamma_t.dim() < x0.dim():
            gamma_t = gamma_t.unsqueeze(-1)

        mask_prob = gamma_t.expand_as(x0)
        mask = torch.bernoulli(mask_prob).bool()
        xt = x0.clone()
        xt[mask] = self.mask_idx
        return xt

    def posterior_logits(
        self, x0_logits: Tensor, xt: Tensor, t: Tensor
    ) -> Tensor:
        """
        Compute q(x_{t-1} | x_t, x0) logits for denoising.
        Returns log-probabilities over vocabulary.
        """
        B, N, V = x0_logits.shape
        gamma_t = self.gamma[t].to(x0_logits.device)          # [B]
        gamma_tm1 = self.gamma[(t - 1).clamp(min=0)].to(x0_logits.device)  # [B]

        # p(x_{t-1} | x_t=MASK, x0) ∝ gamma_{t-1} * x0_probs + (1-gamma_{t-1}) * delta
        x0_probs = x0_logits.softmax(-1)  # [B, N, V]

        # At unmasked positions xt == x_{t-1} with certainty
        is_masked = (xt == self.mask_idx).float().unsqueeze(-1)  # [B, N, 1]

        # Posterior: weighted combination
        g_t = gamma_t.view(B, 1, 1)
        g_tm1 = gamma_tm1.view(B, 1, 1)

        # p(x_{t-1} | x_t, x0)
        post = (1 - g_tm1) * x0_probs + g_tm1 * is_masked * x0_probs
        post = post / (post.sum(-1, keepdim=True) + 1e-8)
        return post.log()

    def sample_step(self, x0_logits: Tensor, xt: Tensor, t: Tensor, temperature: float = 1.0) -> Tensor:
        """Sample x_{t-1} given predicted x0 logits and current x_t."""
        log_post = self.posterior_logits(x0_logits / temperature, xt, t)
        return torch.distributions.Categorical(logits=log_post).sample()


coord_schedule = ContinuousNoiseSchedule(cfg.T_coords, cfg.beta_start, cfg.beta_end)
atom_schedule = DiscreteNoiseSchedule(cfg.T_discrete, cfg.mask_atom_idx, cfg.num_atom_types)
bond_schedule = DiscreteNoiseSchedule(cfg.T_discrete, 0, cfg.num_bond_types)  # NONE as absorbing
coord_schedule = coord_schedule.to(cfg.device)
atom_schedule = atom_schedule.to(cfg.device)
bond_schedule = bond_schedule.to(cfg.device)

print("\n✓ Noise schedules initialized.")



# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3 — EGNN Backbone
# ─────────────────────────────────────────────────────────────────────────────

class EGNNLayer(nn.Module):
    """
    Equivariant Graph Neural Network layer.
    Processes node features (h) and 3D coordinates (x) jointly.
    Coordinate updates are equivariant to rotations/translations.
    """

    def __init__(self, node_dim: int, edge_dim: int, hidden_dim: int, update_coords: bool = True):
        super().__init__()
        self.update_coords = update_coords
        self.eps = 1e-8

        # Edge network: [h_i || h_j || dist^2 || edge_attr] -> message
        self.edge_mlp = nn.Sequential(
            nn.Linear(2 * node_dim + 1 + edge_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.SiLU(),
        )

        # Attention gate on edge messages
        self.att_mlp = nn.Sequential(nn.Linear(hidden_dim, 1), nn.Sigmoid())

        # Node update: [h_i || agg_msg] -> h_i'
        self.node_mlp = nn.Sequential(
            nn.Linear(node_dim + hidden_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, node_dim),
        )

        # Coordinate update: message -> scalar weight for (xi - xj) displacement
        if update_coords:
            self.coord_mlp = nn.Sequential(
                nn.Linear(hidden_dim, hidden_dim),
                nn.SiLU(),
                nn.Linear(hidden_dim, 1, bias=False),
                nn.Tanh(),
            )

        self.norm = nn.LayerNorm(node_dim)

    def forward(
        self,
        h: Tensor,        # [N, node_dim]
        x: Tensor,        # [N, 3]
        edge_idx: Tensor, # [2, E]
        edge_attr: Tensor,# [E, edge_dim]
    ) -> Tuple[Tensor, Tensor]:
        row, col = edge_idx[0], edge_idx[1]

        # Relative displacement and distance
        diff = x[row] - x[col]                           # [E, 3]
        dist_sq = (diff ** 2).sum(-1, keepdim=True)      # [E, 1]

        # Edge messages
        edge_feat = torch.cat([h[row], h[col], dist_sq, edge_attr], dim=-1)
        msg = self.edge_mlp(edge_feat)                   # [E, hidden]
        att = self.att_mlp(msg)                          # [E, 1]
        msg = msg * att

        # Coordinate update (equivariant)
        if self.update_coords:
            coord_w = self.coord_mlp(msg)               # [E, 1]
            # Normalize displacement
            norm = (dist_sq + self.eps).sqrt()
            unit = diff / norm                           # [E, 3]
            coord_agg = torch.zeros_like(x)
            coord_agg.index_add_(0, row, coord_w * unit)
            x = x + coord_agg / (edge_idx.shape[1] / x.shape[0] + self.eps)

        # Node aggregation
        agg = torch.zeros(h.shape[0], msg.shape[-1], device=h.device)
        agg.index_add_(0, row, msg)                      # sum over neighbors

        h_new = self.node_mlp(torch.cat([h, agg], dim=-1))
        h = self.norm(h + h_new)                         # residual + layernorm

        return h, x


class PocketEncoder(nn.Module):
    """
    Encodes protein pocket residues into a fixed-size context vector.
    Input: per-residue features (one-hot amino acid + Cα coordinates).
    Output: context embedding that conditions the ligand diffusion.
    """

    def __init__(self, cfg: DiffusionConfig):
        super().__init__()
        # 20 amino acids + unknown
        self.aa_embed = nn.Embedding(21, cfg.pocket_node_dim)
        self.coord_proj = nn.Linear(3, cfg.pocket_node_dim)

        self.layers = nn.ModuleList([
            EGNNLayer(cfg.pocket_node_dim, cfg.pocket_node_dim, cfg.hidden_dim, update_coords=False)
            for _ in range(2)
        ])

        # Pool to single context vector
        self.pool = nn.Sequential(
            nn.Linear(cfg.pocket_node_dim, cfg.node_dim),
            nn.SiLU(),
        )

    def _build_radius_graph(self, x: Tensor, radius: float = 10.0) -> Tuple[Tensor, Tensor]:
        """Build edges between residues within radius Å."""
        N = x.shape[0]
        dist = torch.cdist(x.unsqueeze(0), x.unsqueeze(0)).squeeze(0)  # [N, N]
        mask = (dist < radius) & (dist > 0)
        edges = mask.nonzero(as_tuple=False).T          # [2, E]
        edge_attr = dist[edges[0], edges[1]].unsqueeze(-1)
        # Pad edge_attr to pocket_node_dim
        edge_attr = edge_attr.expand(-1, x.shape[-1] if x.shape[-1] <= 64 else 64)
        return edges, edge_attr

    def forward(self, aa_ids: Tensor, ca_coords: Tensor) -> Tensor:
        """
        aa_ids:    [P] long, amino acid indices (0-20)
        ca_coords: [P, 3] float, Cα coordinates
        Returns:   [node_dim] context vector
        """
        h = self.aa_embed(aa_ids) + self.coord_proj(ca_coords)   # [P, pocket_dim]
        x = ca_coords

        if h.shape[0] > 1:
            edges, edge_attr = self._build_radius_graph(x)
            # edge_attr needs to be [E, pocket_node_dim]
            E = edges.shape[1]
            edge_attr_full = torch.zeros(E, h.shape[-1], device=h.device)
            edge_attr_full[:, :1] = (x[edges[0]] - x[edges[1]]).norm(dim=-1, keepdim=True)

            for layer in self.layers:
                h, x = layer(h, x, edges, edge_attr_full)

        # Mean pool over residues
        ctx = self.pool(h.mean(0))   # [node_dim]
        return ctx


class DualDiffusionEGNN(nn.Module):
    """
    Shared EGNN backbone for joint coordinate + type denoising.
    Takes noisy (xt_coords, xt_atoms, xt_bonds, t, pocket_ctx) and predicts:
      - noise_pred:     [B, N, 3]  predicted coordinate noise
      - atom_logits:    [B, N, A]  predicted clean atom type logits
      - bond_logits:    [B, N, N, Bo] predicted clean bond type logits
    """

    def __init__(self, cfg: DiffusionConfig):
        super().__init__()
        self.cfg = cfg

        # Atom embedding: discrete atom type -> feature vector
        self.atom_embed = nn.Embedding(cfg.num_atom_types, cfg.node_dim)

        # Time embedding (sinusoidal + MLP)
        self.time_embed = nn.Sequential(
            nn.Linear(cfg.node_dim, cfg.hidden_dim),
            nn.SiLU(),
            nn.Linear(cfg.hidden_dim, cfg.node_dim),
        )

        # Pocket context projection
        self.pocket_proj = nn.Linear(cfg.node_dim, cfg.node_dim)

        # Edge feature embedding: bond type + distance bucket
        self.bond_embed = nn.Embedding(cfg.num_bond_types, cfg.edge_dim // 2)
        self.dist_embed = nn.Linear(1, cfg.edge_dim // 2)

        # EGNN layers
        self.layers = nn.ModuleList([
            EGNNLayer(cfg.node_dim, cfg.edge_dim, cfg.hidden_dim, update_coords=True)
            for _ in range(cfg.num_egnn_layers)
        ])

        # Output heads
        self.coord_head = nn.Sequential(
            nn.Linear(cfg.node_dim, cfg.hidden_dim),
            nn.SiLU(),
            nn.Linear(cfg.hidden_dim, 3),
        )
        self.atom_head = nn.Sequential(
            nn.Linear(cfg.node_dim, cfg.hidden_dim),
            nn.SiLU(),
            nn.Linear(cfg.hidden_dim, cfg.num_atom_types),
        )
        self.bond_head = nn.Sequential(
            nn.Linear(2 * cfg.node_dim, cfg.hidden_dim),
            nn.SiLU(),
            nn.Linear(cfg.hidden_dim, cfg.num_bond_types),
        )

    def _sinusoidal_embed(self, t: Tensor) -> Tensor:
        """Sinusoidal timestep embedding. t: [B] -> [B, node_dim]"""
        d = self.cfg.node_dim
        half = d // 2
        freqs = torch.exp(
            -math.log(10000) * torch.arange(half, device=t.device) / half
        )
        args = t.float().unsqueeze(-1) * freqs.unsqueeze(0)   # [B, half]
        emb = torch.cat([args.sin(), args.cos()], dim=-1)     # [B, d]
        return self.time_embed(emb)

    def _build_fully_connected_edges(self, N: int, device) -> Tuple[Tensor, Tensor]:
        """All pairs edges for N atoms."""
        idx = torch.arange(N, device=device)
        row = idx.repeat_interleave(N)
        col = idx.repeat(N)
        mask = row != col
        return torch.stack([row[mask], col[mask]])

    def forward(
        self,
        xt_coords: Tensor,    # [B, N, 3]
        xt_atoms: Tensor,     # [B, N] long (noisy atom types)
        xt_bonds: Tensor,     # [B, N, N] long (noisy bond matrix)
        t: Tensor,            # [B] long (timestep)
        pocket_ctx: Tensor,   # [B, node_dim] (protein context)
        atom_mask: Tensor,    # [B, N] bool (which atoms are real)
    ) -> Tuple[Tensor, Tensor, Tensor]:

        B, N, _ = xt_coords.shape
        device = xt_coords.device

        # Node features: atom embedding + time + pocket context
        h = self.atom_embed(xt_atoms)              # [B, N, node_dim]
        t_emb = self._sinusoidal_embed(t)          # [B, node_dim]
        ctx = self.pocket_proj(pocket_ctx)         # [B, node_dim]

        h = h + t_emb.unsqueeze(1) + ctx.unsqueeze(1)  # broadcast over N

        # Build fully-connected edges (within each molecule separately)
        edges = self._build_fully_connected_edges(N, device)   # [2, N*(N-1)]
        E = edges.shape[1]

        # Edge features: bond type + distance
        row, col = edges[0], edges[1]

        all_noise_pred, all_atom_logits, all_bond_logits = [], [], []

        for b in range(B):
            hb = h[b]                     # [N, node_dim]
            xb = xt_coords[b]             # [N, 3]

            bond_feat = self.bond_embed(xt_bonds[b][row, col])   # [E, edge_dim//2]
            diff = xb[row] - xb[col]
            dist = diff.norm(dim=-1, keepdim=True)               # [E, 1]
            dist_feat = self.dist_embed(dist)                    # [E, edge_dim//2]
            edge_attr = torch.cat([bond_feat, dist_feat], dim=-1)# [E, edge_dim]

            for layer in self.layers:
                hb, xb = layer(hb, xb, edges, edge_attr)
                # Update edge distances after coordinate change
                dist = (xb[row] - xb[col]).norm(dim=-1, keepdim=True)
                dist_feat = self.dist_embed(dist)
                edge_attr = torch.cat([bond_feat, dist_feat], dim=-1)

            # Coordinate noise prediction
            noise_pred = self.coord_head(hb)        # [N, 3]

            # Atom type logits
            atom_logits = self.atom_head(hb)        # [N, A]

            # Bond logits: for each pair (i,j) -> bond type
            hi_exp = hb.unsqueeze(1).expand(N, N, -1)
            hj_exp = hb.unsqueeze(0).expand(N, N, -1)
            bond_input = torch.cat([hi_exp, hj_exp], dim=-1)   # [N, N, 2*node_dim]
            bond_logits = self.bond_head(bond_input)            # [N, N, Bo]

            all_noise_pred.append(noise_pred)
            all_atom_logits.append(atom_logits)
            all_bond_logits.append(bond_logits)

        noise_pred = torch.stack(all_noise_pred)     # [B, N, 3]
        atom_logits = torch.stack(all_atom_logits)   # [B, N, A]
        bond_logits = torch.stack(all_bond_logits)   # [B, N, N, Bo]

        # Mask padding atoms
        mask = atom_mask.float().unsqueeze(-1)       # [B, N, 1]
        noise_pred = noise_pred * mask
        atom_logits = atom_logits * mask
        bond_logits = bond_logits * mask.unsqueeze(-1)

        return noise_pred, atom_logits, bond_logits


print("✓ EGNN Dual Diffusion model defined.")



# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4 — Full Model with Pocket Encoder
# ─────────────────────────────────────────────────────────────────────────────

class ProteinConditionedDualDiffusion(nn.Module):
    """
    End-to-end model combining:
      - PocketEncoder: encodes protein binding site
      - DualDiffusionEGNN: jointly denoises coords + atom/bond types
    """

    def __init__(self, cfg: DiffusionConfig):
        super().__init__()
        self.cfg = cfg
        self.pocket_encoder = PocketEncoder(cfg)
        self.denoiser = DualDiffusionEGNN(cfg)
        self.coord_schedule = ContinuousNoiseSchedule(
            cfg.T_coords, cfg.beta_start, cfg.beta_end
        ).to(cfg.device)

        self.atom_schedule = DiscreteNoiseSchedule(
            cfg.T_discrete, cfg.mask_atom_idx, cfg.num_atom_types
        ).to(cfg.device)

        self.bond_schedule = DiscreteNoiseSchedule(
            cfg.T_discrete, 0, cfg.num_bond_types
        ).to(cfg.device)

    def encode_pocket(self, aa_ids: Tensor, ca_coords: Tensor) -> Tensor:
        """Batch pocket encoding. Returns [B, node_dim]."""
        return torch.stack([
            self.pocket_encoder(aa_ids[b], ca_coords[b])
            for b in range(aa_ids.shape[0])
        ])

    def forward_loss(self, batch: Dict) -> Dict[str, Tensor]:
        """
        Compute training loss for one batch.
        batch keys:
          coords:     [B, N, 3]  ground truth coordinates
          atom_types: [B, N]     long, ground truth atom types
          bond_types: [B, N, N]  long, ground truth bond matrix
          atom_mask:  [B, N]     bool, real atoms mask
          pocket_aa:  [B, P]     long, pocket amino acid ids
          pocket_ca:  [B, P, 3]  float, pocket Cα coordinates
        """
        B = batch["coords"].shape[0]
        device = batch["coords"].device

        # Sample random timestep
        t = torch.randint(0, self.cfg.T_coords, (B,), device=device)

        # Encode protein pocket
        pocket_ctx = self.encode_pocket(batch["pocket_aa"], batch["pocket_ca"])

        # ── Continuous: add noise to coordinates ──
        noise = torch.randn_like(batch["coords"])
        xt_coords = self.coord_schedule.q_sample(batch["coords"], t, noise)

        # ── Discrete: mask atom and bond types ──
        xt_atoms = self.atom_schedule.q_sample(batch["atom_types"], t)
        xt_bonds = self.bond_schedule.q_sample(batch["bond_types"], t)

        # Forward pass
        noise_pred, atom_logits, bond_logits = self.denoiser(
            xt_coords, xt_atoms, xt_bonds, t, pocket_ctx, batch["atom_mask"]
        )

        # ── Losses ──
        mask = batch["atom_mask"].float()  # [B, N]

        # Coordinate loss: MSE on noise prediction (masked)
        coord_loss = ((noise_pred - noise) ** 2).sum(-1)  # [B, N]
        coord_loss = (coord_loss * mask).sum() / mask.sum().clamp(min=1)

        # Atom type loss: cross-entropy (masked)
        atom_loss = F.cross_entropy(
            atom_logits.view(-1, self.cfg.num_atom_types),
            batch["atom_types"].view(-1),
            reduction="none"
        ).view(B, -1)
        atom_loss = (atom_loss * mask).sum() / mask.sum().clamp(min=1)

        # Bond loss: cross-entropy over all atom pairs
        pair_mask = mask.unsqueeze(-1) * mask.unsqueeze(-2)  # [B, N, N]
        bond_loss = F.cross_entropy(
            bond_logits.view(-1, self.cfg.num_bond_types),
            batch["bond_types"].view(-1),
            reduction="none"
        ).view(B, self.cfg.max_atoms, self.cfg.max_atoms)
        bond_loss = (bond_loss * pair_mask).sum() / pair_mask.sum().clamp(min=1)

        total = (
            self.cfg.lambda_coord * coord_loss
            + self.cfg.lambda_atom * atom_loss
            + self.cfg.lambda_bond * bond_loss
        )

        return {
            "loss": total,
            "coord_loss": coord_loss.item(),
            "atom_loss": atom_loss.item(),
            "bond_loss": bond_loss.item(),
        }

    @torch.no_grad()
    def sample(
        self,
        pocket_aa: Tensor,   # [P] long
        pocket_ca: Tensor,   # [P, 3]
        num_atoms: int = 20,
        num_samples: int = 1,
        temperature: float = 1.0,
        guidance_scale: float = 2.0,
    ) -> Dict:
        """
        Generate molecules conditioned on a pocket.
        Returns dict with coords, atom_types, bond_types.
        """
        device = next(self.parameters()).device
        B = num_samples
        N = num_atoms

        # Encode pocket (same for all samples)
        pocket_ctx = self.pocket_encoder(pocket_aa, pocket_ca).unsqueeze(0).expand(B, -1)

        # Initialize from noise / MASK
        xt_coords = torch.randn(B, N, 3, device=device)
        xt_atoms = torch.full((B, N), self.cfg.mask_atom_idx, device=device, dtype=torch.long)
        xt_bonds = torch.zeros(B, N, N, device=device, dtype=torch.long)
        atom_mask = torch.ones(B, N, device=device, dtype=torch.bool)

        T = self.cfg.T_coords
        step_size = max(1, T // self.cfg.sample_steps)
        timesteps = list(range(T - 1, -1, -step_size))

        for t_val in timesteps:
            t = torch.full((B,), t_val, device=device, dtype=torch.long)

            noise_pred_c, atom_logits_c, bond_logits_c = self.denoiser(
                xt_coords, xt_atoms, xt_bonds, t, pocket_ctx, atom_mask
            )

            null_ctx = torch.zeros_like(pocket_ctx)
            noise_pred_u, atom_logits_u, bond_logits_u = self.denoiser(
                  xt_coords, xt_atoms, xt_bonds, t, null_ctx, atom_mask
            )

            noise_pred = noise_pred_u + guidance_scale * (noise_pred_c - noise_pred_u)
            atom_logits = atom_logits_u + guidance_scale * (atom_logits_c - atom_logits_u)
            bond_logits = bond_logits_u + guidance_scale * (bond_logits_c - bond_logits_u)

            # Reverse coordinate step
            xt_coords = self.coord_schedule.ddpm_step(xt_coords, t, noise_pred)

            # Reverse discrete step
            xt_atoms = self.atom_schedule.sample_step(atom_logits, xt_atoms, t, temperature)
            xt_bonds = self.bond_schedule.sample_step(bond_logits.view(B, N * N, -1),
                                                       xt_bonds.view(B, N * N), t,
                                                       temperature).view(B, N, N)

            idx = torch.arange(N, device=device)

            # symmetric
            xt_bonds = (xt_bonds + xt_bonds.transpose(1,2)) // 2

            # remove self bonds
            xt_bonds[:, idx, idx] = 0

            # distance cutoff
            dist = torch.cdist(xt_coords, xt_coords)
            xt_bonds[dist > 1.9] = 0

            # remove masked atoms
            mask = (xt_atoms != self.cfg.mask_atom_idx).long()
            xt_bonds = xt_bonds * mask.unsqueeze(1)
            xt_bonds = xt_bonds * mask.unsqueeze(2)
            # binary
            xt_bonds = torch.clamp(xt_bonds, 0, 1)

            MAX_VALENCE = torch.tensor(
                [1,4,3,2,1,5,6,1,1,1],
                device=device
            )

            for b in range(B):
                for i in range(N):

                    atom = xt_atoms[b, i]

                    if atom >= len(MAX_VALENCE):
                        continue

                    max_v = MAX_VALENCE[atom]
                    neighbors = xt_bonds[b, i].nonzero(as_tuple=True)[0]

                    if len(neighbors) > max_v:
                        keep = neighbors[:max_v]

                        mask_row = torch.zeros_like(xt_bonds[b, i])
                        mask_row[keep] = 1

                        xt_bonds[b, i] *= mask_row
                        xt_bonds[b, :, i] *= mask_row

        return {
            "coords": xt_coords.cpu().numpy(),       # [B, N, 3]
            "atom_types": xt_atoms.cpu().numpy(),    # [B, N]
            "bond_types": xt_bonds.cpu().numpy(),    # [B, N, N]
        }


print("✓ ProteinConditionedDualDiffusion model defined.")




# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 — Synthetic Dataset (PDBBind-style mock data)
# ─────────────────────────────────────────────────────────────────────────────

class SyntheticPDBBindDataset(torch.utils.data.Dataset):
    """
    Generates synthetic protein-ligand complex data that mimics PDBBind format.
    Replace generate_sample() with real PDBBind parsing for production use.

    Real PDBBind integration notes:
    --------------------------------
    Download PDBBind from http://www.pdbbind.org.cn/
    Parse with: from Bio.PDB import PDBParser
    Extract pocket residues within 10Å of ligand centroid.
    Use RDKit to parse SDF files for ligand coords/atom/bond info.
    """

    AMINO_ACIDS = list("ACDEFGHIKLMNPQRSTVWY")  # 20 standard AAs

    def __init__(self, cfg: DiffusionConfig, size: int = 1000):
        self.cfg = cfg
        self.size = size
        self.samples = [self._generate_sample() for _ in range(size)]

    def _generate_sample(self) -> Dict:
        cfg = self.cfg
        rng = np.random

        # ── Ligand ──
        num_atoms = rng.randint(8, cfg.max_atoms)
        # Atom types (exclude MASK index)
        valid_atom_types = list(range(cfg.num_atom_types - 1))
        atom_types_raw = rng.choice(valid_atom_types, size=num_atoms)
        coords_raw = rng.randn(num_atoms, 3).astype(np.float32) * 3.0

        # Pad to max_atoms
        atom_types = np.full(cfg.max_atoms, cfg.mask_atom_idx, dtype=np.int64)
        coords = np.zeros((cfg.max_atoms, 3), dtype=np.float32)
        atom_mask = np.zeros(cfg.max_atoms, dtype=bool)
        atom_types[:num_atoms] = atom_types_raw
        coords[:num_atoms] = coords_raw
        atom_mask[:num_atoms] = True

        # Bond matrix (symmetric): random sparse bonds
        bond_matrix = np.zeros((cfg.max_atoms, cfg.max_atoms), dtype=np.int64)
        for i in range(num_atoms):
            for j in range(i + 1, num_atoms):
                if rng.random() < 0.3:   # ~30% bond density
                    btype = rng.randint(1, cfg.num_bond_types)
                    bond_matrix[i, j] = btype
                    bond_matrix[j, i] = btype

        # ── Pocket ──
        num_residues = rng.randint(10, cfg.max_pocket_residues)
        aa_ids = rng.randint(0, 20, size=cfg.max_pocket_residues).astype(np.int64)
        # Place pocket residues around ligand centroid
        centroid = coords_raw.mean(0)
        ca_coords = (centroid + rng.randn(cfg.max_pocket_residues, 3) * 8.0).astype(np.float32)

        return {
            "coords": torch.tensor(coords),
            "atom_types": torch.tensor(atom_types, dtype=torch.long),
            "bond_types": torch.tensor(bond_matrix, dtype=torch.long),
            "atom_mask": torch.tensor(atom_mask),
            "pocket_aa": torch.tensor(aa_ids, dtype=torch.long),
            "pocket_ca": torch.tensor(ca_coords),
            "num_atoms": num_atoms,
            "num_residues": num_residues,
        }

    def __len__(self): return self.size
    def __getitem__(self, idx): return self.samples[idx]


def collate_fn(batch):
    keys = batch[0].keys()
    output = {}

    for k in keys:
        if isinstance(batch[0][k], torch.Tensor):
            output[k] = torch.stack([b[k] for b in batch])
        else:
            output[k] = [b[k] for b in batch]  # keep as list

    return output

print("✓ Synthetic dataset defined.")
print("  → Replace SyntheticPDBBindDataset._generate_sample() with real PDBBind parsing")
print("    for production use. See docstring for instructions.")


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6 — Training Loop
# ─────────────────────────────────────────────────────────────────────────────

def train(cfg: DiffusionConfig, model: ProteinConditionedDualDiffusion, verbose: bool = True):
    device = torch.device(cfg.device)
    model = model.to(device)

    dataset = PocketLigandDataset(os.path.join("dataset_cleaned", "1981-2000"),cfg)
    loader = torch.utils.data.DataLoader(
        dataset, batch_size=cfg.batch_size,
        shuffle=True, collate_fn=collate_fn, num_workers=0
    )

    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.lr, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg.num_epochs)

    history = []
    best_loss = float("inf")

    print(f"\n{'='*60}")
    print(f"  Training: {cfg.num_epochs} epochs | batch={cfg.batch_size} | device={device}")
    print(f"  Dataset: {len(dataset)} complexes")
    print(f"{'='*60}\n")

    for epoch in range(1, cfg.num_epochs + 1):
        model.train()
        epoch_losses = {"loss": 0, "coord_loss": 0, "atom_loss": 0, "bond_loss": 0}
        num_batches = 0

        for batch in loader:
            batch = {
                k: v.to(device) if isinstance(v, torch.Tensor) else v
                for k, v in batch.items()
            }

            optimizer.zero_grad()
            losses = model.forward_loss(batch)
            losses["loss"].backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
            optimizer.step()

            for k in epoch_losses:
                epoch_losses[k] += losses[k] if isinstance(losses[k], float) else losses[k].item()
            num_batches += 1

        scheduler.step()
        for k in epoch_losses:
            epoch_losses[k] /= num_batches

        history.append(epoch_losses)

        if epoch_losses["loss"] < best_loss:
            best_loss = epoch_losses["loss"]
            torch.save(model.state_dict(), os.path.join(cfg.save_dir, "best_model.pt"))

        if verbose and (epoch % 5 == 0 or epoch == 1):
            print(
                f"Epoch {epoch:3d}/{cfg.num_epochs} | "
                f"Loss: {epoch_losses['loss']:.4f} | "
                f"Coord: {epoch_losses['coord_loss']:.4f} | "
                f"Atom: {epoch_losses['atom_loss']:.4f} | "
                f"Bond: {epoch_losses['bond_loss']:.4f}"
            )

    print(f"\n✓ Training complete. Best loss: {best_loss:.4f}")
    return history



# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7 — Post-Processing & Validity Checks
# ─────────────────────────────────────────────────────────────────────────────

def try_import_rdkit():
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors
        return Chem, AllChem, Descriptors, rdMolDescriptors
    except ImportError:
        print("⚠ RDKit not available. Validity checks will use heuristics only.")
        return None, None, None, None


ATOM_TYPE_TO_SYMBOL = {
    0: "H", 1: "C", 2: "N", 3: "O", 4: "F",
    5: "P", 6: "S", 7: "Cl", 8: "Br", 9: "I"
}
BOND_TYPE_TO_RDKIT = {1: "SINGLE", 2: "DOUBLE", 3: "TRIPLE", 4: "AROMATIC"}


def build_rdkit_mol(atom_types: np.ndarray, bond_matrix: np.ndarray, coords: np.ndarray):
    """
    Attempt to build an RDKit molecule from generated arrays.
    Returns (mol, success) where mol may be None.
    """
    Chem, AllChem, _, _ = try_import_rdkit()
    if Chem is None:
        return None, _heuristic_validity(atom_types)

    try:
        N = len(atom_types)
        mol = Chem.RWMol()
        conf = Chem.Conformer(N)

        for i, at in enumerate(atom_types):
            symbol = ATOM_TYPE_TO_SYMBOL.get(int(at), "C")
            atom = Chem.Atom(symbol)
            mol.AddAtom(atom)
            conf.SetAtomPosition(i, coords[i].tolist())

        added = set()
        for i in range(N):
            for j in range(i + 1, N):
                btype = int(bond_matrix[i, j])
                if btype > 0 and (i, j) not in added:
                    rdkit_btype = getattr(
                        Chem.rdchem.BondType,
                        BOND_TYPE_TO_RDKIT.get(btype, "SINGLE")
                    )
                    mol.AddBond(i, j, rdkit_btype)
                    added.add((i, j))

        mol.AddConformer(conf, assignId=True)
        mol = mol.GetMol()

        # Sanitize
        Chem.SanitizeMol(mol)
        return mol, True

    except Exception as e:
        return None, False


def _heuristic_validity(atom_types: np.ndarray) -> bool:
    """Simple heuristic check when RDKit is unavailable."""
    # At least some carbon atoms
    carbon_count = (atom_types == 1).sum()
    return carbon_count >= 2 and len(atom_types) >= 3


def compute_validity_metrics(mol, atom_types: np.ndarray) -> Dict:
    """Compute chemical validity metrics for a generated molecule."""
    Chem, AllChem, Descriptors, rdMolDescriptors = try_import_rdkit()

    if mol is None or Chem is None:
        return {
            "valid": False,
            "qed": None, "mw": None, "num_hba": None,
            "num_hbd": None, "logp": None, "smiles": None
        }

    try:
        smiles = Chem.MolToSmiles(mol)
        return {
            "valid": True,
            "smiles": smiles,
            "qed": Descriptors.qed(mol),
            "mw": Descriptors.MolWt(mol),
            "logp": Descriptors.MolLogP(mol),
            "num_hba": rdMolDescriptors.CalcNumHBA(mol),
            "num_hbd": rdMolDescriptors.CalcNumHBD(mol),
            "num_rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
            "num_rings": rdMolDescriptors.CalcNumRings(mol),
        }
    except Exception:
      return {
          "valid": False,
          "smiles": None,
          "qed": None,
          "mw": None,
          "logp": None,
          "num_hba": None,
          "num_hbd": None
      }


def filter_duplicates(records: List[Dict]) -> List[Dict]:
    """Remove duplicate molecules by SMILES string."""
    seen_smiles = set()
    unique = []
    for rec in records:
        sm = rec.get("smiles")
        if sm is None:
            unique.append(rec)  # keep if no SMILES (heuristic valid)
        elif sm not in seen_smiles:
            seen_smiles.add(sm)
            unique.append(rec)
    return unique


print("✓ Post-processing utilities defined.")



# ─────────────────────────────────────────────────────────────────────────────
# SECTION 8 — Dataset Generator
# ─────────────────────────────────────────────────────────────────────────────
from rdkit import Chem
from rdkit.Chem import RDConfig
sys.path.append(os.path.join(RDConfig.RDContribDir, "SA_Score"))
import sascorer
class MolecularDatasetGenerator:
    """
    Generates large-scale protein-conditioned molecular datasets using the
    trained dual diffusion model. Outputs a structured dataset suitable for
    training downstream models (e.g., PMDM).

    Output schema per record:
    {
        "protein_id":    str,
        "coords":        List[List[float]],  # [N, 3]
        "atom_types":    List[int],          # [N]
        "atom_symbols":  List[str],          # [N]
        "bond_matrix":   List[List[int]],    # [N, N]
        "num_atoms":     int,
        "valid":         bool,
        "smiles":        str | None,
        "qed":           float | None,
        "mw":            float | None,
        "logp":          float | None,
        "pocket_aa":     List[int],
        "pocket_ca":     List[List[float]],
    }
    """

    def __init__(self, model: ProteinConditionedDualDiffusion, cfg: DiffusionConfig):
        self.model = model
        self.cfg = cfg
        self.device = torch.device(cfg.device)
        self.model.eval()
        self.model.to(self.device)

    def generate_for_pocket(
        self,
        pocket_aa: np.ndarray,    # [P] int
        pocket_ca: np.ndarray,    # [P, 3] float
        protein_id: str = "UNK",
        num_atoms: int = 20,
        num_samples: int = 100,
        temperature: float = 1.0,
        batch_size: int = 16,
        filter_dupes: bool = True,
    ) -> List[Dict]:
        """Generate num_samples molecules for a single protein pocket."""

        aa_t = torch.tensor(pocket_aa, dtype=torch.long, device=self.device)
        ca_t = torch.tensor(pocket_ca, dtype=torch.float32, device=self.device)

        all_records = []
        generated = 0

        while generated < num_samples:
            bs = min(batch_size, num_samples - generated)
            result = self.model.sample(aa_t, ca_t, num_atoms, bs, temperature)

            for i in range(bs):
                coords_i = result["coords"][i]         # [N, 3]
                atom_types_i = result["atom_types"][i] # [N]
                bond_matrix_i = result["bond_types"][i]# [N, N]

                # Filter MASK atoms
                real_mask = atom_types_i != self.cfg.mask_atom_idx
                if real_mask.sum() < 3:
                    continue

                real_atoms = atom_types_i[real_mask]
                real_coords = coords_i[real_mask]
                real_bonds = bond_matrix_i[np.ix_(real_mask, real_mask)]

                # Build RDKit mol + validity check
                mol, valid = build_rdkit_mol(real_atoms, real_bonds, real_coords)
                metrics = compute_validity_metrics(mol, real_atoms)

                record = {
                    "protein_id": protein_id,
                    "coords": real_coords.tolist(),
                    "atom_types": real_atoms.tolist(),
                    "atom_symbols": [ATOM_TYPE_TO_SYMBOL.get(int(a), "C") for a in real_atoms],
                    "bond_matrix": real_bonds.tolist(),
                    "num_atoms": int(real_mask.sum()),
                    "pocket_aa": pocket_aa.tolist(),
                    "pocket_ca": pocket_ca.tolist(),
                    "mol":mol,
                    **metrics,
                }
                all_records.append(record)

            generated += bs
            print(f"  [{protein_id}] Generated {generated}/{num_samples} | "
                  f"Valid so far: {sum(r['valid'] for r in all_records)}", end="\r")

        print()  # newline

        if filter_dupes:
            before = len(all_records)
            all_records = filter_duplicates(all_records)
            print(f"  [{protein_id}] After dedup: {len(all_records)}/{before} unique molecules")

        return all_records

    def save_sdf(self, records: List[Dict], output_path: str):
        """
        Save generated molecules with 3D coordinates to an SDF file.
        Requires the 'mol' key to be present (set before filtering removes it).
        Rebuilds the mol from coords/atom_types/bond_matrix if 'mol' is missing.
        """
        from rdkit import Chem
        from rdkit.Chem import AllChem

        writer = Chem.SDWriter(output_path)
        written = 0

        for rec in records:
            if not rec.get("valid"):
                continue

            # Rebuild mol with 3D conformer from stored coords
            atom_types_arr = np.array(rec["atom_types"])
            bond_matrix_arr = np.array(rec["bond_matrix"])
            coords_arr     = np.array(rec["coords"])       # shape [N, 3] — real 3D from model

            mol, success = build_rdkit_mol(atom_types_arr, bond_matrix_arr, coords_arr)
            if not success or mol is None:
                continue

            conf = Chem.Conformer(mol.GetNumAtoms())
            for i, pos in enumerate(coords_arr):
                conf.SetAtomPosition(i, pos.tolist())
            mol.AddConformer(conf, assignId=True)

            # Attach metadata as SDF properties
            mol.SetProp("_Name",      rec.get("protein_id", "UNK"))
            mol.SetProp("SMILES",     rec.get("smiles", ""))
            mol.SetProp("QED",        str(rec.get("qed", "")))
            mol.SetProp("MW",         str(rec.get("mw", "")))
            mol.SetProp("LOGP",       str(rec.get("logp", "")))
            mol.SetProp("NUM_HBA",    str(rec.get("num_hba", "")))
            mol.SetProp("NUM_HBD",    str(rec.get("num_hbd", "")))

            writer.write(mol)
            written += 1

        writer.close()
        print(f"✓ SDF saved: {output_path}  ({written} molecules with 3D coords)")

    def generate_dataset(
        self,
        proteins: List[Dict],    # list of {id, pocket_aa, pocket_ca}
        num_samples_per_protein: int = 200,
        num_atoms: int = 20,
        output_file: Optional[str] = None,
    ) -> List[Dict]:
        """Generate dataset across multiple protein targets."""
        all_records = []

        for prot in proteins:
            print(f"\n→ Generating for protein: {prot['id']}")
            records = self.generate_for_pocket(
                prot["pocket_aa"],
                prot["pocket_ca"],
                protein_id=prot["id"],
                num_atoms=num_atoms,
                num_samples=num_samples_per_protein,
            )

            def clean_molecule(mol):
                try:
                    Chem.SanitizeMol(mol)
                    return mol
                except:
                    return None

            def is_drug_like(mol):
                mw = Descriptors.MolWt(mol)
                logp = Descriptors.MolLogP(mol)
                h_donors = Descriptors.NumHDonors(mol)
                h_acceptors = Descriptors.NumHAcceptors(mol)

                if mw > 500: return False
                if logp > 5: return False
                if h_donors > 5: return False
                if h_acceptors > 10: return False

                return True

            filtered_records = []

            for r in records:
                if not r["valid"]:
                    continue

                if r["num_atoms"] > 40:
                    continue

                mol = r.get("mol", None)
                sa = sascorer.calculateScore(mol)

                if sa > 6.5:
                    continue

                # r_clean = r.copy()

                # # remove RDKit Mol object (causes circular reference)
                # if "mol" in r_clean:
                #     del r_clean["mol"]

                filtered_records.append(r)

            all_records.extend(filtered_records)
            print(f"  ✓ {len(records)} molecules generated for {prot['id']}")

        # Summary statistics
        valid_count = sum(r["valid"] for r in all_records)
        print(f"\n{'='*60}")
        print(f"  Dataset Summary")
        print(f"{'='*60}")
        print(f"  Total molecules:  {len(all_records)}")
        if len(all_records) > 0:
            print(f"  Valid molecules:  {valid_count} ({100*valid_count/len(all_records):.1f}%)")
        else:
            print(f"  Valid molecules:  0 (0.0%)")
        print(f"  Proteins covered: {len(proteins)}")

        qed_vals = [r["qed"] for r in all_records if r.get("qed") is not None]
        if qed_vals:
            print(f"  Mean QED:         {np.mean(qed_vals):.3f} ± {np.std(qed_vals):.3f}")

        mw_vals = [r["mw"] for r in all_records if r.get("mw") is not None]
        if mw_vals:
            print(f"  Mean MW:          {np.mean(mw_vals):.1f} Da")

        def convert(o):
            if isinstance(o, (np.bool_,)):
                return bool(o)
            if isinstance(o, (np.integer,)):
                return int(o)
            if isinstance(o, (np.floating,)):
                return float(o)
            return o
        
        def strip_mol(records):
          return [{k: v for k, v in r.items() if k != "mol"} for r in records]

        if output_file:
            # ---------- SAVE JSON ----------
            with open(output_file, "w") as f:
                json.dump(strip_mol(all_records), f, indent=2, default=convert,allow_nan=True)

            print(f"\n✓ Dataset saved to: {output_file}")

            # ---------- SAVE SDF ----------
            sdf_output = output_file.replace(".json", ".sdf")
            self.save_sdf(all_records, sdf_output)
        return all_records
                
    def save_checkpoint(self, path: str):
        torch.save({
            "model_state": self.model.state_dict(),
            "cfg": asdict(self.cfg),
        }, path)
        print(f"✓ Checkpoint saved: {path}")

    def load_checkpoint(self, path: str):
        ckpt = torch.load(path, map_location=self.device)
        self.model.load_state_dict(ckpt["model_state"])
        print(f"✓ Checkpoint loaded: {path}")


print("✓ MolecularDatasetGenerator defined.")



# ─────────────────────────────────────────────────────────────────────────────
# SECTION 9 — Main: Quick Demo Run
# ─────────────────────────────────────────────────────────────────────────────

def run_demo():
    """
    Full pipeline demo:
      1. Build model
      2. Train for a few epochs on synthetic data
      3. Generate molecules for 3 mock protein targets
      4. Save dataset as JSON
    """
    print("\n" + "="*60)
    print("  Protein-Conditioned Dual Diffusion — Demo Run")
    print("="*60)

    # ── Override config for quick demo ──
    cfg.num_epochs = 50        # increase to 100+ for real training
    cfg.batch_size = 2
    cfg.sample_steps = 50      # faster sampling
    cfg.num_samples = 100       # molecules per protein

    # ── Build model ──
    model = ProteinConditionedDualDiffusion(cfg)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"\n✓ Model created | Parameters: {total_params:,}")

    # ── Train ──
    #print("\n[PHASE 1] Training...")
    #history = train(cfg, model, verbose=True)
    history = []
    print("\n⚠️  Training SKIPPED (model uses random weights)")

    # ── Load best checkpoint ──
    best_ckpt = os.path.join(cfg.save_dir, "best_model.pt")
    if os.path.exists(best_ckpt):
        try:
            model.load_state_dict(torch.load(best_ckpt, map_location=cfg.device))
            print("✓ Loaded best checkpoint.")
        except Exception as e:
            print(f"⚠ Failed to load checkpoint: {e}")
    else:
        print(f"⚠ No checkpoint found.")

    # ── Generate dataset ──
    print("\n[PHASE 2] Generating molecules...")
    generator = MolecularDatasetGenerator(model, cfg)

    # Mock protein targets (replace with real PDBBind pocket data)
    mock_proteins = []
    for pid in ["2HNI", "3EML", "4QAC"]:
        num_res = np.random.randint(15, 30)
        mock_proteins.append({
            "id": pid,
            "pocket_aa": np.random.randint(0, 20, size=cfg.max_pocket_residues),
            "pocket_ca": np.random.randn(cfg.max_pocket_residues, 3).astype(np.float32) * 5.0,
        })

    dataset = generator.generate_dataset(
        proteins=mock_proteins,
        num_samples_per_protein=cfg.num_samples,
        num_atoms=20,
        output_file=os.path.join(cfg.save_dir, "generated_molecules.json"),
    )

    # ── Save full checkpoint ──
    generator.save_checkpoint(os.path.join(cfg.save_dir, "final_model.pt"))

    print("\n✓ Demo complete!")
    print(f"  Output directory: {cfg.save_dir}/")
    print(f"  Files:")
    for f in os.listdir(cfg.save_dir):
        fpath = os.path.join(cfg.save_dir, f)
        print(f"    {f}  ({os.path.getsize(fpath)//1024} KB)")

    return dataset, model, history



# # ─────────────────────────────────────────────────────────────────────────────
# # SECTION 10 — Real PDBBind Integration (commented template)
# # ─────────────────────────────────────────────────────────────────────────────

# PDBBIND_INTEGRATION_TEMPLATE = '''
# # ──────────────────────────────────────────────────────
# # Real PDBBind Integration Template
# # ──────────────────────────────────────────────────────
# # Prerequisites:
# #   pip install biopython rdkit-pypi
# '''

from Bio.PDB import PDBParser
from rdkit import Chem
from rdkit.Chem import AllChem
import numpy as np

AMINO_ACID_MAP = {
    "ALA":0,"CYS":1,"ASP":2,"GLU":3,"PHE":4,"GLY":5,"HIS":6,"ILE":7,
    "LYS":8,"LEU":9,"MET":10,"ASN":11,"PRO":12,"GLN":13,"ARG":14,
    "SER":15,"THR":16,"VAL":17,"TRP":18,"TYR":19
}

def parse_pocket(pdb_path: str, ligand_sdf: str, pocket_radius: float = 10.0):
    parser = PDBParser(QUIET=True)
    structure = parser.get_structure("prot", pdb_path)

    # Get ligand centroid from SDF
    lig_mol = Chem.MolFromMolFile(ligand_sdf, removeHs=False)
    conf = lig_mol.GetConformer()
    lig_coords = np.array([list(conf.GetAtomPosition(i)) for i in range(lig_mol.GetNumAtoms())])
    centroid = lig_coords.mean(0)

    # Collect Cα atoms within pocket_radius of centroid
    aa_ids, ca_coords = [], []
    for model in structure:
        for chain in model:
            for residue in chain:
                if residue.id[0] != " ": continue  # skip HET
                resname = residue.resname.strip()
                if resname not in AMINO_ACID_MAP: continue
                if "CA" not in residue: continue
                ca = np.array(residue["CA"].coord)
                if np.linalg.norm(ca - centroid) <= pocket_radius:
                    aa_ids.append(AMINO_ACID_MAP[resname])
                    ca_coords.append(ca)

    return np.array(aa_ids), np.array(ca_coords, dtype=np.float32)


def parse_ligand(sdf_path: str, max_atoms: int = 38):
    mol = Chem.MolFromMolFile(sdf_path, removeHs=True)
    if mol is None: return None

    mol = AllChem.AddHs(mol)
    AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())

    ATOM_MAP = {"H":0,"C":1,"N":2,"O":3,"F":4,"P":5,"S":6,"Cl":7,"Br":8,"I":9}
    BOND_MAP = {
        Chem.rdchem.BondType.SINGLE: 1,
        Chem.rdchem.BondType.DOUBLE: 2,
        Chem.rdchem.BondType.TRIPLE: 3,
        Chem.rdchem.BondType.AROMATIC: 4,
    }

    N = mol.GetNumAtoms()
    if N > max_atoms: return None

    conf = mol.GetConformer()
    coords = np.array([list(conf.GetAtomPosition(i)) for i in range(N)], dtype=np.float32)
    atom_types = np.array([ATOM_MAP.get(a.GetSymbol(), 1) for a in mol.GetAtoms()])
    bond_matrix = np.zeros((N, N), dtype=np.int64)
    for bond in mol.GetBonds():
        i, j = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        btype = BOND_MAP.get(bond.GetBondType(), 1)
        bond_matrix[i,j] = bond_matrix[j,i] = btype

    return {"coords": coords, "atom_types": atom_types, "bond_matrix": bond_matrix}


class PDBBindDataset(torch.utils.data.Dataset):
    def __init__(self, root: str, cfg: DiffusionConfig, split: str = "train"):
        """
        root: path to PDBBind root directory (contains index/ and refined-set/)
        """
        self.cfg = cfg
        self.records = []
        index_file = os.path.join(root, "index", f"INDEX_general_PL_{split}.2020")
        with open(index_file) as f:
            pdb_ids = [line.split()[0] for line in f if not line.startswith("#")]

        for pdb_id in pdb_ids:
            pdb_dir = os.path.join(root, "refined-set", pdb_id)
            pdb_path = os.path.join(pdb_dir, f"{pdb_id}_protein.pdb")
            sdf_path = os.path.join(pdb_dir, f"{pdb_id}_ligand.sdf")
            if not (os.path.exists(pdb_path) and os.path.exists(sdf_path)):
                continue
            try:
                aa_ids, ca_coords = parse_pocket(pdb_path, sdf_path)
                lig = parse_ligand(sdf_path, cfg.max_atoms)
                if lig and len(aa_ids) >= 5:
                    self.records.append({"pdb_id": pdb_id, "aa_ids": aa_ids,
                                         "ca_coords": ca_coords, **lig})
            except Exception:
                pass

    def __len__(self): return len(self.records)
    def __getitem__(self, idx):
        r = self.records[idx]
        N = len(r["atom_types"])
        cfg = self.cfg
        # Pad to max_atoms
        atom_types = np.full(cfg.max_atoms, cfg.mask_atom_idx, dtype=np.int64)
        coords = np.zeros((cfg.max_atoms, 3), dtype=np.float32)
        bond_matrix = np.zeros((cfg.max_atoms, cfg.max_atoms), dtype=np.int64)
        atom_mask = np.zeros(cfg.max_atoms, dtype=bool)
        atom_types[:N] = r["atom_types"]
        coords[:N] = r["coords"]
        bond_matrix[:N,:N] = r["bond_matrix"]
        atom_mask[:N] = True
        P = min(len(r["aa_ids"]), cfg.max_pocket_residues)
        pocket_aa = np.zeros(cfg.max_pocket_residues, dtype=np.int64)
        pocket_ca = np.zeros((cfg.max_pocket_residues, 3), dtype=np.float32)
        pocket_aa[:P] = r["aa_ids"][:P]
        pocket_ca[:P] = r["ca_coords"][:P]
        return {
            "coords": torch.tensor(coords),
            "atom_types": torch.tensor(atom_types, dtype=torch.long),
            "bond_types": torch.tensor(bond_matrix, dtype=torch.long),
            "atom_mask": torch.tensor(atom_mask),
            "pocket_aa": torch.tensor(pocket_aa, dtype=torch.long),
            "pocket_ca": torch.tensor(pocket_ca),
        }


print("✓ PDBBind integration template ready (see PDBBIND_INTEGRATION_TEMPLATE string).")

# ─────────────────────────────────────────────────────────────────────────────
# Testing
# ─────────────────────────────────────────────────────────────────────────────
# ============================================
# ORIGINAL DATASET EVALUATION
# ============================================
def original_dataset_evaluation():
    from rdkit import Chem
    from rdkit.Chem import Descriptors, QED
    import os, zipfile

    # unzip
    if not os.path.exists("1981-2000.zip"):
        # print("1981-2000.zip not found — skipping original dataset evaluation")
        return [], []
    with zipfile.ZipFile("1981-2000.zip") as z:
        z.extractall("dataset/")

    ref_smiles = []
    orig_metrics = []

    for root, _, files in os.walk("dataset/"):
        for f in files:
            if f.endswith("_ligand.sdf"):
                path = os.path.join(root, f)
                mol = Chem.MolFromMolFile(path)

                if mol is None:
                    continue

                smiles = Chem.MolToSmiles(mol)
                ref_smiles.append(smiles)

                orig_metrics.append({
                    "qed": QED.qed(mol),
                    "mw": Descriptors.MolWt(mol),
                    "logp": Descriptors.MolLogP(mol)
                })

    print("Original dataset size:", len(orig_metrics))
    return ref_smiles, orig_metrics

ref_smiles, orig_metrics = original_dataset_evaluation()

# ============================================
# GENERATED DATASET EVALUATION
# ============================================

def generated_dataset_evaluation():
    import json
    from rdkit import Chem
    from rdkit.Chem import Descriptors, QED

    sdf_path = "./outputs/generated_molecules.sdf"

    if not os.path.exists(sdf_path):
        print("generated_molecules.sdf not found — skipping generated evaluation")
        return [],[]

    gen_smiles = []
    gen_metrics = []

    supplier = Chem.SDMolSupplier("./outputs/generated_molecules.sdf")

    for mol in supplier:
        if mol is None:
            continue

        smiles = Chem.MolToSmiles(mol)
        gen_smiles.append(smiles)

        gen_metrics.append({
            "qed": QED.qed(mol),
            "mw": Descriptors.MolWt(mol),
            "logp": Descriptors.MolLogP(mol)
        })

    print("Generated dataset size:", len(gen_metrics))
    return gen_smiles, gen_metrics

# ============================================
# Compare distributions of QED, MW, LogP
# ============================================

def compare_metrics(orig_metrics, gen_metrics):
    import numpy as np
    def mean(values):
        return round(float(np.mean(values)), 3)

    return {
        "orig_qed": mean([x["qed"] for x in orig_metrics]),
        "gen_qed": mean([x["qed"] for x in gen_metrics]),
        "orig_mw": mean([x["mw"] for x in orig_metrics]),
        "gen_mw": mean([x["mw"] for x in gen_metrics]),
        "orig_logp": mean([x["logp"] for x in orig_metrics]),
        "gen_logp": mean([x["logp"] for x in gen_metrics]),
    }
# ============================================
# Validity, Uniqueness, Novelty
# ============================================
def compute_comparsion(gen_smiles, ref_smiles):

    from rdkit import Chem

    validity = len(gen_smiles) / len(list(Chem.SDMolSupplier("outputs/generated_molecules.sdf")))

    uniqueness = len(set(gen_smiles)) / len(gen_smiles)

    novelty = len([s for s in gen_smiles if s not in ref_smiles]) / len(gen_smiles)

    return {
        "Validity": validity,
        "Uniqueness": uniqueness,
        "Novelty":novelty
    }

# ============================================
# SA Score (synthetic accessibility)
# ============================================
def compute_sa_scores():
    import os, sys
    from rdkit import Chem
    from rdkit import RDConfig
    # load SA scorer from RDKit contrib
    sys.path.append(os.path.join(RDConfig.RDContribDir, "SA_Score"))
    import sascorer

    # load molecules
    supplier = Chem.SDMolSupplier("outputs/generated_molecules.sdf")

    sa_scores = []

    for mol in supplier:
        if mol is None:
            continue

        sa = sascorer.calculateScore(mol)
        sa_scores.append(sa)

    return{
        "mean_sa": sum(sa_scores)/len(sa_scores),
        "min_sa": min(sa_scores),
        "max_sa": max(sa_scores)
    }

# ============================================
# Accuracy
# ============================================

def compute_accuracy(orig_metrics, gen_metrics):
    def accuracy(metrics):
        correct = 0
        total = len(metrics)
        if total == 0:
            return 0

        for m in metrics:
            mw = m["mw"]
            logp = m["logp"]
            qed = m["qed"]

            if mw <= 500 and logp <= 5 and qed >= 0.3:
                correct += 1

        return correct / total if total > 0 else 0


    orig_acc = accuracy(orig_metrics)
    gen_acc  = accuracy(gen_metrics)

    print("Overall Accuracy")
    print(f"Original Dataset  : {orig_acc:.3f} ({orig_acc*100:.1f}%)")
    print(f"Generated Dataset : {gen_acc:.3f} ({gen_acc*100:.1f}%)")

    return{
        "orig_acc": orig_acc,
        "gen_acc": gen_acc
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def clean_dataset(dataset):
    cleaned = []

    for d in dataset:
        item = {
            "coords": d.get("coords"),
            "atom_types": d.get("atom_types"),
            "bond_types": d.get("bond_types"),
            "protein": d.get("protein"),
            "smiles": d.get("smiles"),
            "qed": d.get("qed"),
            "mw": d.get("mw"),
            "valid": d.get("valid"),
            "num_atoms": d.get("num_atoms"),
        }

        # convert numpy / tensor -> list
        for k, v in item.items():
            if hasattr(v, "tolist"):
                item[k] = v.tolist()

        cleaned.append(item)

    return cleaned

def evaluate_generated_dataset(dataset):

    gen_smiles, gen_metrics = generated_dataset_evaluation()

    met = compare_metrics(orig_metrics, gen_metrics)
    comp = compute_comparsion(gen_smiles, ref_smiles)
    sa_scores = compute_sa_scores()
    acc_scores = compute_accuracy(orig_metrics, gen_metrics)

    eval_dict = {
            # Accuracy
            "orig_acc": acc_scores["orig_acc"],
            "gen_acc": acc_scores["gen_acc"],
            
            "orig_qed": met["orig_qed"],
            "gen_qed": met["gen_qed"],

            "orig_mw": met["orig_mw"],
            "gen_mw": met["gen_mw"],

            "orig_logp": met["orig_logp"],
            "gen_logp": met["gen_logp"],

            "validity": comp["Validity"],
            "uniqueness": comp["Uniqueness"],
            "novelty": comp["Novelty"],
        }
        
    print("\n✓ Evaluation metrics computed successfully")
    print("="*60)
    print("EVAL DICT:", eval_dict)
        
    return eval_dict
 
    
#================================
#Main entry point
#================================

if __name__ == "__main__":
    dataset, model, history = run_demo()

    # DEBUG (optional)
    for i, d in enumerate(dataset):
        if d is dataset:
            print("Circular reference at index", i)

    # CLEAN
    dataset = clean_dataset(dataset)

    # SAVE
    import json
    with open("./outputs/generated_molecules.json", "w") as f:
        json.dump(dataset, f, indent=2,allow_nan=True)
    
    eval_metrics = evaluate_generated_dataset(dataset)
    print("Evaluation metrics:", eval_metrics)

    # To train on real PDBBind data, replace:
    #   SyntheticPDBBindDataset → PDBBindDataset (see PDBBIND_INTEGRATION_TEMPLATE)
    # and increase cfg.num_epochs to 200+.

