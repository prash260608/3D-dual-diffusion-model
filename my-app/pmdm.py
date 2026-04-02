# =============================================================================
# IMPROVED PMDM — FINAL COMPLETE VERSION
# Single file, no cross-imports, updated for 863 cleaned molecules
# =============================================================================

# STEP 0 — IMPORTS & DEVICE SETUP
import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
import math
import numpy as np
from pathlib import Path
from collections import defaultdict
from torch.utils.data import Dataset, DataLoader
from rdkit import Chem, RDLogger
from rdkit.Chem import QED, Descriptors, Crippen

RDLogger.DisableLog('rdApp.*')

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[Step 0] Using device: {device}")
if device.type == "cuda":
    print(f"         GPU: {torch.cuda.get_device_name(0)}")
    print(f"         VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")


# =============================================================================
# STEP 1 — CONSTANTS & ATOM MAPPING
# =============================================================================
NUM_ATOM_TYPES = 10

ATOM_MAP = {
    6:  0,   # Carbon
    7:  1,   # Nitrogen
    8:  2,   # Oxygen
    9:  3,   # Fluorine
    16: 4,   # Sulfur
    15: 5,   # Phosphorus
    17: 6,   # Chlorine
    35: 7,   # Bromine
    53: 8,   # Iodine
    # anything else → 9
}

IDX_TO_ATOMIC = {
    0: 6,    # Carbon
    1: 7,    # Nitrogen
    2: 8,    # Oxygen
    3: 9,    # Fluorine
    4: 16,   # Sulfur
    5: 15,   # Phosphorus
    6: 17,   # Chlorine
    7: 35,   # Bromine
    8: 53,   # Iodine
    9: 6,    # Other → Carbon
}

# Drug-like log-prior — biases generation toward C/N/O at inference time
DRUG_LIKE_LOG_PRIOR = torch.tensor([
    +2.0,   # C
    +1.2,   # N
    +1.2,   # O
    +0.2,   # F
    +0.2,   # S
    -0.5,   # P
    +0.0,   # Cl
    -1.5,   # Br
    -3.0,   # I
    -3.0,   # X
], dtype=torch.float32)

# Valence limits per element
MAX_VALENCE = {6: 4, 7: 3, 8: 2, 9: 1, 16: 2, 15: 3, 17: 1, 35: 1, 53: 1}

# Bond distance thresholds (Å)
BOND_THRESHOLDS = {
    (6,  6):  1.85,
    (6,  7):  1.75,
    (6,  8):  1.75,
    (6,  9):  1.65,
    (6,  16): 2.00,
    (6,  17): 1.95,
    (6,  35): 2.10,
    (6,  53): 2.30,
    (7,  7):  1.65,
    (7,  8):  1.65,
    (8,  8):  1.70,
    (15, 8):  1.80,
    (16, 8):  1.80,
}
DEFAULT_BOND_THRESHOLD = 1.90


def atomic_num_to_idx(atom_nums: torch.Tensor) -> torch.Tensor:
    return torch.tensor(
        [ATOM_MAP.get(a.item(), 9) for a in atom_nums],
        dtype=torch.long
    )

def atom_types_to_onehot(indices: torch.Tensor) -> torch.Tensor:
    return F.one_hot(indices, num_classes=NUM_ATOM_TYPES).float()

print("[Step 1] Constants defined.")


# =============================================================================
# STEP 2 — DIFFUSION SCHEDULE
# =============================================================================
class DiffusionSchedule:
    def __init__(self, T=100, beta_start=1e-4, beta_end=0.02, device='cpu'):
        self.T          = T
        self.device     = device
        self.betas      = torch.linspace(beta_start, beta_end, T).to(device)
        self.alphas     = 1.0 - self.betas
        self.alpha_bars = torch.cumprod(self.alphas, dim=0)

    def add_noise(self, x0, t):
        alpha_bar_t = self.alpha_bars[t].view(1, 1)
        eps         = torch.randn_like(x0)
        xt          = torch.sqrt(alpha_bar_t) * x0 + torch.sqrt(1 - alpha_bar_t) * eps
        return xt, eps

    def get_alpha_bar(self, t):
        return self.alpha_bars[t]

print("[Step 2] DiffusionSchedule defined.")


# =============================================================================
# STEP 3 — SINUSOIDAL TIMESTEP EMBEDDING
# =============================================================================
class SinusoidalTimestepEmbedding(nn.Module):
    def __init__(self, hidden_dim=64):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.linear1    = nn.Linear(hidden_dim, hidden_dim)
        self.linear2    = nn.Linear(hidden_dim, hidden_dim)

    def forward(self, t: torch.Tensor) -> torch.Tensor:
        half      = self.hidden_dim // 2
        freqs     = torch.exp(
            -math.log(10000) * torch.arange(half, device=t.device) / half
        ).float()
        args      = t.float().unsqueeze(-1) * freqs.unsqueeze(0)
        embedding = torch.cat([torch.sin(args), torch.cos(args)], dim=-1)
        embedding = torch.relu(self.linear1(embedding))
        embedding = self.linear2(embedding)
        return embedding

print("[Step 3] SinusoidalTimestepEmbedding defined.")


# =============================================================================
# STEP 4 — LOCAL EQUIVARIANT LAYER
# =============================================================================
class LocalEquivariantLayer(nn.Module):
    def __init__(self, hidden_dim=64):
        super().__init__()
        self.msg_mlp = nn.Sequential(
            nn.Linear(hidden_dim * 2 + 1, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, hidden_dim)
        )
        self.feat_mlp = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, hidden_dim)
        )
        self.coord_mlp = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, 1)
        )

    def forward(self, feat, coords, t_emb):
        N    = coords.size(0)
        ci   = coords.unsqueeze(1).expand(N, N, 3)
        cj   = coords.unsqueeze(0).expand(N, N, 3)
        rel  = ci - cj
        dist = torch.norm(rel, dim=-1, keepdim=True)

        fi     = feat.unsqueeze(1).expand(N, N, -1)
        fj     = feat.unsqueeze(0).expand(N, N, -1)
        msgs   = self.msg_mlp(torch.cat([fi, fj, dist], dim=-1))

        mask   = (~torch.eye(N, dtype=torch.bool, device=coords.device)).unsqueeze(-1)
        msgs   = msgs * mask

        # Per-pair scalar → correct equivariant coord update
        scalar     = self.coord_mlp(msgs)                # (N, N, 1)
        coord_upd  = (scalar * rel).sum(dim=1)           # (N, 3)
        new_coords = coords + coord_upd

        agg      = msgs.sum(dim=1)
        t_exp    = t_emb.expand(N, -1)
        new_feat = self.feat_mlp(torch.cat([feat + agg, t_exp], dim=-1))

        return new_feat, new_coords

print("[Step 4] LocalEquivariantLayer defined.")


# =============================================================================
# STEP 5 — GLOBAL EQUIVARIANT LAYER
# =============================================================================
class GlobalEquivariantLayer(nn.Module):
    def __init__(self, hidden_dim=64):
        super().__init__()
        # Takes ligand feat + pocket feat + dist → 2H+1
        self.msg_mlp = nn.Sequential(
            nn.Linear(hidden_dim * 2 + 1, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, hidden_dim)
        )
        self.feat_mlp = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, hidden_dim)
        )
        self.coord_mlp = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.SiLU(),
            nn.Linear(hidden_dim, 1)
        )

    def forward(self, lig_feat, lig_coords, poc_feat, poc_coords, t_emb):
        N    = lig_coords.size(0)
        M    = poc_coords.size(0)

        li   = lig_coords.unsqueeze(1).expand(N, M, 3)
        pj   = poc_coords.unsqueeze(0).expand(N, M, 3)
        rel  = li - pj
        dist = torch.norm(rel, dim=-1, keepdim=True)

        # Ligand features included in message (was missing in original)
        lf     = lig_feat.unsqueeze(1).expand(N, M, -1)
        pf     = poc_feat.unsqueeze(0).expand(N, M, -1)
        msgs   = self.msg_mlp(torch.cat([lf, pf, dist], dim=-1))
        agg    = msgs.mean(dim=1)

        t_exp        = t_emb.expand(N, -1)
        new_lig_feat = self.feat_mlp(torch.cat([lig_feat + agg, t_exp], dim=-1))

        scalar         = self.coord_mlp(agg)
        coord_upd      = (scalar.unsqueeze(1) * rel).mean(dim=1)
        new_lig_coords = lig_coords + coord_upd

        return new_lig_feat, new_lig_coords

print("[Step 5] GlobalEquivariantLayer defined.")


# =============================================================================
# STEP 6 — ATOM TYPE DIFFUSION
# =============================================================================
def add_type_noise(atom_types_onehot: torch.Tensor,
                   t: torch.Tensor, T: int = 100) -> torch.Tensor:
    alpha_t = 1.0 - (t.float().item() / T)
    uniform = torch.ones_like(atom_types_onehot) / NUM_ATOM_TYPES
    return alpha_t * atom_types_onehot + (1.0 - alpha_t) * uniform

print("[Step 6] add_type_noise defined.")


# =============================================================================
# STEP 7 — DATASET
# =============================================================================
class PDBBindDataset(Dataset):
    def __init__(self, base_path: str):
        self.base    = Path(base_path)
        self.samples = []
        for folder in sorted(self.base.iterdir()):
            if not folder.is_dir():
                continue
            pdb_id   = folder.name
            lig_path = folder / f"{pdb_id}_ligand.sdf"
            poc_path = folder / f"{pdb_id}_pocket.pdb"
            if lig_path.exists() and poc_path.exists():
                self.samples.append((lig_path, poc_path, pdb_id))
        print(f"[Step 7] Dataset: {len(self.samples)} complexes from {base_path}")

    def __len__(self):
        return len(self.samples)

    def _load_ligand(self, lig_path):
        supplier = Chem.SDMolSupplier(str(lig_path), sanitize=False)
        mol      = supplier[0] if supplier else None
        if mol is None:
            return None, None
        try:
            conf = mol.GetConformer()
        except ValueError:
            return None, None
        coords, atoms = [], []
        for atom in mol.GetAtoms():
            pos = conf.GetAtomPosition(atom.GetIdx())
            coords.append([pos.x, pos.y, pos.z])
            atoms.append(atom.GetAtomicNum())
        return (torch.tensor(coords, dtype=torch.float32),
                torch.tensor(atoms,  dtype=torch.long))

    def _load_pocket(self, poc_path):
        mol = Chem.MolFromPDBFile(str(poc_path), sanitize=False)
        if mol is None:
            return None, None
        try:
            conf = mol.GetConformer()
        except ValueError:
            return None, None
        coords, atoms = [], []
        for atom in mol.GetAtoms():
            pos = conf.GetAtomPosition(atom.GetIdx())
            coords.append([pos.x, pos.y, pos.z])
            atoms.append(atom.GetAtomicNum())
        return (torch.tensor(coords, dtype=torch.float32),
                torch.tensor(atoms,  dtype=torch.long))

    def __getitem__(self, idx):
        lig_path, poc_path, pdb_id = self.samples[idx]
        lig_coords, lig_atoms = self._load_ligand(lig_path)
        poc_coords, poc_atoms = self._load_pocket(poc_path)

        if lig_coords is None or poc_coords is None:
            return self.__getitem__((idx + 1) % len(self))
        if lig_coords.size(0) < 3 or poc_coords.size(0) < 5:
            return self.__getitem__((idx + 1) % len(self))

        center     = lig_coords.mean(dim=0)
        lig_coords = lig_coords - center
        poc_coords = poc_coords - center

        return {
            "lig_coords": lig_coords,
            "lig_atoms":  lig_atoms,
            "poc_coords": poc_coords,
            "poc_atoms":  poc_atoms,
            "pdb_id":     pdb_id
        }

print("[Step 7] PDBBindDataset defined.")


# =============================================================================
# STEP 8 — MODEL
# =============================================================================
class ImprovedPMDM(nn.Module):
    def __init__(self, hidden_dim=128, num_layers=3):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers

        self.atom_embed = nn.Embedding(100, hidden_dim)
        self.type_embed = nn.Linear(NUM_ATOM_TYPES, hidden_dim)
        self.t_embed    = SinusoidalTimestepEmbedding(hidden_dim)

        self.local_layers  = nn.ModuleList([
            LocalEquivariantLayer(hidden_dim) for _ in range(num_layers)
        ])
        self.global_layers = nn.ModuleList([
            GlobalEquivariantLayer(hidden_dim) for _ in range(num_layers)
        ])
        self.fusion = nn.ModuleList([
            nn.Sequential(
                nn.Linear(hidden_dim * 2, hidden_dim),
                nn.SiLU(),
                nn.Linear(hidden_dim, hidden_dim)
            ) for _ in range(num_layers)
        ])

        self.coord_head = nn.Linear(hidden_dim, 3)
        self.type_head  = nn.Linear(hidden_dim, NUM_ATOM_TYPES)

    def forward(self, lig_atoms, lig_coords, poc_atoms, poc_coords,
                noisy_types, t):
        t_emb    = self.t_embed(t)
        poc_feat = self.atom_embed(poc_atoms)
        lig_feat = self.atom_embed(lig_atoms) + self.type_embed(noisy_types)

        for local_layer, global_layer, fuse in zip(
            self.local_layers, self.global_layers, self.fusion
        ):
            local_feat,  local_coords  = local_layer(lig_feat, lig_coords, t_emb)
            global_feat, global_coords = global_layer(
                lig_feat, lig_coords, poc_feat, poc_coords, t_emb
            )
            lig_feat   = fuse(torch.cat([local_feat, global_feat], dim=-1))
            lig_coords = (local_coords + global_coords) / 2.0

        return self.coord_head(lig_feat), self.type_head(lig_feat)

print("[Step 8] ImprovedPMDM defined.")
_tmp = ImprovedPMDM(hidden_dim=128, num_layers=3)
print(f"         Trainable params: {sum(p.numel() for p in _tmp.parameters() if p.requires_grad):,}")
del _tmp


# =============================================================================
# STEP 9 — TRAINING
# Updated for 863 molecules:
#   hidden_dim : 128  (up from 64 — larger dataset can support bigger model)
#   num_epochs : 150  (up from 100 — more data needs more epochs to converge)
#   lr         : 1e-3 (unchanged)
#   save_every : 25   (saves at 25, 50, 75, 100, 125, 150)
# =============================================================================
def compute_class_weights(dataset, device):
    counts = torch.zeros(NUM_ATOM_TYPES)
    for i in range(len(dataset)):
        for idx in atomic_num_to_idx(dataset[i]["lig_atoms"]):
            counts[idx] += 1
    weights = 1.0 / (counts + 1e-6)
    weights = weights / weights.sum() * NUM_ATOM_TYPES
    print("Atom counts  :", counts.int().tolist())
    print("Class weights:", weights.round(decimals=2).tolist())
    return weights.to(device)


def train(
    data_path   = "/content/dataset_cleaned",   # ← your cleaned dataset
    drive_path  = "/content/drive/MyDrive/pmdm_checkpoints",
    hidden_dim  = 128,    # ← increased from 64 for 863 molecules
    num_layers  = 3,
    num_epochs  = 150,    # ← increased from 100
    lr          = 1e-3,
    T           = 100,
    save_every  = 25,     # ← saves at 25/50/75/100/125/150
    resume_from = None
):
    schedule = DiffusionSchedule(T=T, device=device)
    print(f"[Schedule] T={T} timesteps")

    Path(drive_path).mkdir(parents=True, exist_ok=True)
    dataset       = PDBBindDataset(data_path)
    loader        = DataLoader(dataset, batch_size=1, shuffle=True, num_workers=0)
    model         = ImprovedPMDM(hidden_dim=hidden_dim, num_layers=num_layers).to(device)
    optimizer     = optim.Adam(model.parameters(), lr=lr)

    # StepLR: halve LR every 15 epochs (was 10) to account for longer training
    sched_lr      = optim.lr_scheduler.StepLR(optimizer, step_size=15, gamma=0.5)
    coord_loss_fn = nn.MSELoss()
    class_weights = compute_class_weights(dataset, device)
    type_loss_fn  = nn.CrossEntropyLoss(weight=class_weights)
    start_epoch   = 0

    if resume_from and Path(resume_from).exists():
        ckpt        = torch.load(resume_from, map_location=device)
        model.load_state_dict(ckpt["model_state"])
        optimizer.load_state_dict(ckpt["optimizer_state"])
        start_epoch = ckpt["epoch"] + 1
        print(f"[Train] Resumed from epoch {start_epoch}")

    print(f"[Train] {num_epochs} epochs | {len(dataset)} complexes | device={device}")
    print(f"        hidden_dim={hidden_dim} | num_layers={num_layers} | lr={lr}")
    print("-" * 65)

    for epoch in range(start_epoch, num_epochs):
        model.train()
        total_loss = total_coord = total_type = n_batches = 0

        for batch in loader:
            lig_coords   = batch["lig_coords"][0].to(device)
            lig_atoms    = batch["lig_atoms"][0].to(device)
            poc_coords   = batch["poc_coords"][0].to(device)
            poc_atoms    = batch["poc_atoms"][0].to(device)

            t               = torch.randint(0, T, (1,), device=device)
            noisy_coords, _ = schedule.add_noise(lig_coords, t)
            alpha_bar_t     = schedule.get_alpha_bar(t).view(1, 1)
            atom_indices    = atomic_num_to_idx(lig_atoms).to(device)
            true_onehot     = atom_types_to_onehot(atom_indices)
            noisy_types     = add_type_noise(true_onehot, t, T=T)

            coord_pred, type_logits = model(
                lig_atoms, noisy_coords, poc_atoms, poc_coords, noisy_types, t
            )

            x0_pred    = (noisy_coords - torch.sqrt(1 - alpha_bar_t) * coord_pred) \
                         / (torch.sqrt(alpha_bar_t) + 1e-8)
            loss_coord = coord_loss_fn(x0_pred, lig_coords)
            loss_type  = type_loss_fn(type_logits, atom_indices)
            loss       = loss_coord + 2.0 * loss_type

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

            total_loss  += loss.item()
            total_coord += loss_coord.item()
            total_type  += loss_type.item()
            n_batches   += 1

        sched_lr.step()
        n = max(n_batches, 1)
        print(f"Epoch {epoch+1:03d}/{num_epochs} | "
              f"Loss: {total_loss/n:.4f} | "
              f"Coord: {total_coord/n:.4f} | "
              f"Type: {total_type/n:.4f} | "
              f"LR: {sched_lr.get_last_lr()[0]:.6f}")

        if (epoch + 1) % save_every == 0:
            ckpt_path = Path(drive_path) / f"pmdm_epoch_{epoch+1:03d}.pt"
            torch.save({
                "epoch":           epoch,
                "model_state":     model.state_dict(),
                "optimizer_state": optimizer.state_dict(),
                "loss":            total_loss / n,
                "hidden_dim":      hidden_dim,
                "num_layers":      num_layers,
            }, ckpt_path)
            print(f"         ✓ Saved → {ckpt_path}")

    print("-" * 65)
    print("[Train] Complete.")
    return model, schedule


# =============================================================================
# STEP 10 — CHECKPOINT UTILITIES
# =============================================================================
def save_checkpoint(model, optimizer, epoch, loss, path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "epoch": epoch, "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict(), "loss": loss,
        "hidden_dim": model.hidden_dim, "num_layers": model.num_layers,
    }, path)
    print(f"[Checkpoint] Saved → {path}")


def load_checkpoint(path, device=device):
    ckpt       = torch.load(path, map_location=device)
    hidden_dim = ckpt.get("hidden_dim", 128)
    num_layers = ckpt.get("num_layers", 3)
    model      = ImprovedPMDM(hidden_dim=hidden_dim, num_layers=num_layers).to(device)
    model.load_state_dict(ckpt["model_state"])
    print(f"[Checkpoint] Loaded epoch {ckpt['epoch']+1}, loss={ckpt['loss']:.4f}")
    return model, ckpt

print("[Step 10] Checkpoint utilities defined.")


# =============================================================================
# STEP 11 — GENERATION HELPERS
# =============================================================================
def bias_type_logits(logits: torch.Tensor, strength: float = 1.0) -> torch.Tensor:
    prior = DRUG_LIKE_LOG_PRIOR.to(logits.device) * strength
    return logits + prior.unsqueeze(0)


def _build_adjacency(coords, atomic_nums):
    bonds = []
    N     = len(atomic_nums)
    for i in range(N):
        for j in range(i + 1, N):
            dist = float(np.linalg.norm(coords[i] - coords[j]))
            key  = tuple(sorted([atomic_nums[i], atomic_nums[j]]))
            if dist < BOND_THRESHOLDS.get(key, DEFAULT_BOND_THRESHOLD):
                bonds.append((i, j))
    return bonds


def _largest_connected_component(N, bonds):
    parent = list(range(N))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i, j in bonds:
        parent[find(i)] = find(j)

    groups = defaultdict(set)
    for i in range(N):
        groups[find(i)].add(i)

    return max(groups.values(), key=len)


def _valence_correct(bonds, coords, atomic_nums):
    bond_lengths = {
        (i, j): float(np.linalg.norm(coords[i] - coords[j]))
        for i, j in bonds
    }
    sorted_bonds = sorted(bonds, key=lambda b: -bond_lengths[b])
    degree, kept = defaultdict(int), []
    for i, j in sorted_bonds:
        max_i = MAX_VALENCE.get(atomic_nums[i], 4)
        max_j = MAX_VALENCE.get(atomic_nums[j], 4)
        if degree[i] < max_i and degree[j] < max_j:
            kept.append((i, j))
            degree[i] += 1
            degree[j] += 1
    return kept

print("[Step 11] Generation helpers defined.")


# =============================================================================
# STEP 12 — COORDS → RDKIT MOLECULE
# =============================================================================
def coords_to_molecule(coords, atom_types):
    if isinstance(coords, torch.Tensor):     coords     = coords.numpy()
    if isinstance(atom_types, torch.Tensor): atom_types = atom_types.numpy()

    N           = len(atom_types)
    atomic_nums = [IDX_TO_ATOMIC.get(int(t), 6) for t in atom_types]

    bonds = _build_adjacency(coords, atomic_nums)
    if not bonds:
        return None

    # Keep largest connected component
    lcc        = sorted(_largest_connected_component(N, bonds))
    lcc_set    = set(lcc)
    old_to_new = {old: new for new, old in enumerate(lcc)}
    bonds      = [(old_to_new[i], old_to_new[j])
                  for i, j in bonds if i in lcc_set and j in lcc_set]
    coords      = coords[lcc]
    atomic_nums = [atomic_nums[i] for i in lcc]
    N           = len(lcc)

    # Valence correction
    bonds = _valence_correct(bonds, coords, atomic_nums)

    mol  = Chem.RWMol()
    for an in atomic_nums:
        mol.AddAtom(Chem.Atom(int(an)))
    conf = Chem.Conformer(N)
    for i, (x, y, z) in enumerate(coords):
        conf.SetAtomPosition(i, (float(x), float(y), float(z)))
    mol.AddConformer(conf, assignId=True)
    for i, j in bonds:
        mol.AddBond(i, j, Chem.BondType.SINGLE)

    try:
        Chem.SanitizeMol(mol)
        return mol.GetMol()
    except Exception:
        try:
            for atom in mol.GetAtoms():
                atom.SetFormalCharge(0)
            Chem.SanitizeMol(mol)
            return mol.GetMol()
        except Exception:
            return None

print("[Step 12] coords_to_molecule defined.")


# =============================================================================
# STEP 13 — REVERSE DIFFUSION SAMPLER
# =============================================================================
@torch.no_grad()
def generate_molecule(
    model,
    schedule,
    poc_coords,
    poc_atoms,
    num_atoms      = 20,
    T              = 100,
    prior_strength = 1.2,
    device         = device
):
    model.eval()
    poc_coords = poc_coords.to(device)
    poc_atoms  = poc_atoms.to(device)

    xt        = torch.randn(num_atoms, 3, device=device) * 0.5
    ht        = torch.ones(num_atoms, NUM_ATOM_TYPES, device=device) / NUM_ATOM_TYPES
    lig_atoms = torch.randint(0, NUM_ATOM_TYPES, (num_atoms,), device=device)

    for t_val in reversed(range(T)):
        t           = torch.tensor([t_val], device=device)
        alpha_bar_t = schedule.alpha_bars[t_val]
        beta_t      = schedule.betas[t_val]
        alpha_t     = schedule.alphas[t_val]

        coord_pred, type_logits = model(
            lig_atoms, xt, poc_atoms, poc_coords, ht, t
        )

        # Drug-like prior bias
        type_logits_biased = bias_type_logits(type_logits, strength=prior_strength)
        type_probs         = torch.softmax(type_logits_biased / 0.5, dim=-1)
        blend              = 1.0 - (t_val / T)
        ht                 = (1 - blend) * ht + blend * type_probs
        lig_atoms          = ht.argmax(dim=-1)

        # DDPM coordinate update
        coeff1  = 1.0 / torch.sqrt(alpha_t)
        coeff2  = beta_t / torch.sqrt(1.0 - alpha_bar_t + 1e-8)
        mean_xt = coeff1 * (xt - coeff2 * coord_pred)
        xt      = mean_xt + (torch.sqrt(beta_t) * torch.randn_like(xt)
                             if t_val > 0 else 0)

    coord_range = xt.max() - xt.min()
    if coord_range > 0:
        xt = xt / coord_range * 8.0

    return xt.cpu(), ht.argmax(dim=-1).cpu()

print("[Step 13] generate_molecule defined.")


# =============================================================================
# STEP 14 — GENERATE + EVALUATE PIPELINE
# =============================================================================
def generate_and_evaluate(
    model,
    schedule,
    dataset,
    n_molecules    = 10,
    num_atoms      = 20,
    T              = 100,
    prior_strength = 1.2
):
    dev        = next(model.parameters()).device
    type_names = {0:'C', 1:'N', 2:'O', 3:'F', 4:'S',
                  5:'P', 6:'Cl', 7:'Br', 8:'I', 9:'X'}

    print(f"Generating {n_molecules} molecules "
          f"(prior_strength={prior_strength}, num_atoms={num_atoms})...\n")

    generated_mols = []
    for i in range(n_molecules):
        sample     = dataset[i % len(dataset)]
        poc_coords = sample["poc_coords"]
        poc_atoms  = sample["poc_atoms"]

        coords, atom_types = generate_molecule(
            model=model, schedule=schedule,
            poc_coords=poc_coords, poc_atoms=poc_atoms,
            num_atoms=num_atoms, T=T,
            prior_strength=prior_strength, device=dev
        )

        u, c      = torch.unique(atom_types, return_counts=True)
        atom_dist = {type_names[x.item()]: c[j].item() for j, x in enumerate(u)}
        mol       = coords_to_molecule(coords, atom_types)
        status    = "✓" if mol is not None else "✗"

        if mol is not None:
            print(f"  [{status}] Molecule {i+1:2d} | raw: {atom_dist} | "
                  f"kept: {mol.GetNumAtoms()} atoms")
        else:
            print(f"  [{status}] Molecule {i+1:2d} | raw: {atom_dist} | "
                  f"failed sanitization")
        generated_mols.append(mol)

    valid = [m for m in generated_mols if m is not None]
    print(f"\n{'─'*60}")
    print(f"Total generated  : {len(generated_mols)}")
    print(f"Valid molecules  : {len(valid)}  "
          f"({100*len(valid)/max(len(generated_mols),1):.0f}%)")

    if not valid:
        print("No valid molecules — try increasing prior_strength or num_atoms.")
        return generated_mols

    qeds = [QED.qed(m) for m in valid]
    mws  = [Descriptors.MolWt(m) for m in valid]
    lip  = sum(1 for m in valid
               if Descriptors.MolWt(m) <= 500
               and Crippen.MolLogP(m) <= 5
               and Descriptors.NumHDonors(m) <= 5
               and Descriptors.NumHAcceptors(m) <= 10)

    print(f"Avg QED          : {np.mean(qeds):.3f}   (target > 0.5)")
    print(f"Avg MW           : {np.mean(mws):.1f} Da  (target < 500)")
    print(f"Lipinski pass    : {lip}/{len(valid)}")
    print(f"\nSample SMILES:")
    for m in valid[:5]:
        print(f"  QED={QED.qed(m):.3f}  MW={Descriptors.MolWt(m):.1f}  "
              f"{Chem.MolToSmiles(m)}")

    return generated_mols


# =============================================================================
# ENTRY POINT — TRAINING
# Comment out after first run and use the inference block below instead
# =============================================================================
"""trained_model, schedule = train(
    data_path   = "/content/dataset_cleaned",
    drive_path  = "/content/drive/MyDrive/pmdm_checkpoints",
    hidden_dim  = 128,
    num_layers  = 3,
    num_epochs  = 150,
    lr          = 1e-3,
    T           = 100,
    save_every  = 25,
    resume_from = None,   # ← set to checkpoint path to resume e.g.
                          #   "/content/drive/MyDrive/pmdm_checkpoints/pmdm_epoch_025.pt"
)"""


# =============================================================================
# ENTRY POINT — INFERENCE
# Comment out the training block above and run this after training is done
# =============================================================================
CKPT_PATH = "pmdm_epoch_150.pt"
DATA_PATH = "C:/Users/kanch/OneDrive/Desktop/3D_mol/dataset_cleaned"

if Path(CKPT_PATH).exists():
    trained_model, _ = load_checkpoint(CKPT_PATH)
    schedule         = DiffusionSchedule(T=100, device=device)
    dataset          = PDBBindDataset(DATA_PATH)

    mols = generate_and_evaluate(
        model          = trained_model,
        schedule       = schedule,
        dataset        = dataset,
        n_molecules    = 10,
        num_atoms      = 20,
        T              = 100,
        prior_strength = 1.2,   # raise to 1.5-2.0 if still seeing I/Br/X
    )
else:
    print(f"[Inference] Checkpoint not found at {CKPT_PATH}. Train first.")