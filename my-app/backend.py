from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch

from pmdm import load_checkpoint, DiffusionSchedule, generate_molecule

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model, _ = load_checkpoint("pmdm_epoch_150.pt")
schedule = DiffusionSchedule(T=100)


# 👇 THIS FIXES REQUEST FORMAT
class RequestData(BaseModel):
    smiles: str
    num_atoms: int = 20
    prior_strength: float = 2.0
    T: int = 100


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate_from_smiles")
def generate(data: RequestData):
    poc_coords = torch.randn(30, 3)
    poc_atoms = torch.randint(1, 10, (30,))

    coords, atom_types = generate_molecule(
        model,
        schedule,
        poc_coords,
        poc_atoms,
        num_atoms=data.num_atoms,
        T=data.T,
        prior_strength=data.prior_strength
    )

    return {
        "coords": coords.tolist(),
        "symbols": ["C"] * len(coords),
        "bonds": [],
        "smiles": data.smiles
    }