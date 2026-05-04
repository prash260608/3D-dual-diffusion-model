from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import json

from model import run_demo, clean_dataset, evaluate_generated_dataset 

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "outputs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


@app.get("/")
def root():
    return {"status": "API running"}


# Run diffusion model (default dataset)
@app.post("/generate")
def generate():
    try:
        print("\n" + "="*60)
        print("🔄 STARTING GENERATION PIPELINE")
        print("="*60)
        
        # Step 1: Generate
        print("📍 Step 1: Running diffusion model...")
        dataset, _, _ = run_demo()
        print(f"   ✓ Generated {len(dataset)} molecules")
        
        # Step 2: Clean
        print("📍 Step 2: Cleaning dataset...")
        dataset = clean_dataset(dataset)
        print(f"   ✓ Cleaned {len(dataset)} molecules")
        
        # Step 3: Verify files exist before evaluation
        print("📍 Step 3: Checking output files...")
        sdf_path = os.path.join(OUTPUT_DIR, "generated_molecules.sdf")
        json_path = os.path.join(OUTPUT_DIR, "generated_molecules.json")
        
        sdf_exists = os.path.exists(sdf_path)
        json_exists = os.path.exists(json_path)
        
        print(f"   ✓ SDF file exists: {sdf_exists} ({os.path.getsize(sdf_path) if sdf_exists else 0} bytes)")
        print(f"   ✓ JSON file exists: {json_exists} ({os.path.getsize(json_path) if json_exists else 0} bytes)")
        
        if not sdf_exists:
            print("   ⚠️  WARNING: SDF file not found. Evaluation may be incomplete.")
        
        # Step 4: Evaluate
        print("📍 Step 4: Evaluating generated dataset...")
        eval_metrics = evaluate_generated_dataset(dataset)
        
        print(f"   ✓ Evaluation complete")
        print(f"   📊 Metrics returned: {eval_metrics}")
        
        print("="*60)
        print("✅ GENERATION PIPELINE COMPLETE")
        print("="*60 + "\n")

        return {
            "status": "success",
            "num_molecules": len(dataset),
            "molecules": dataset,
            "eval":eval_metrics
        }
    except Exception as e:
        print("\n" + "="*60)
        print("❌ ERROR IN GENERATION PIPELINE")
        print("="*60)
        print(f"Error: {str(e)}")
        print("\nFull traceback:")
        traceback.print_exc()
        print("="*60 + "\n")
        
        return {
            "status": "error",
            "error": str(e),
            "num_molecules": 0,
            "molecules": [],
            "eval": {}  # <-- Return empty eval on error
        }


# Upload single PDB
@app.post("/upload-pdb")
async def upload_pdb(file: UploadFile = File(...)):
    path = os.path.join(UPLOAD_DIR, file.filename)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"status": "uploaded", "file": file.filename}


# Upload ZIP dataset
@app.post("/upload-zip")
async def upload_zip(file: UploadFile = File(...)):
    path = os.path.join(UPLOAD_DIR, file.filename)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"status": "uploaded", "file": file.filename}


# Get generated molecules JSON
@app.get("/results")
def results():
    path = "outputs/generated_molecules.json"

    if not os.path.exists(path):
        return {"error": "No results yet"}

    with open(path) as f:
        data = json.load(f)

    return data

@app.get("/metrics")
def get_metrics():
    """
    Retrieve pre-computed evaluation metrics.
    
    Returns the evaluation dictionary with all metrics:
    - Accuracy (orig and generated)
    - QED, MW, LogP statistics
    - Validity, uniqueness, novelty
    - SA scores
    """
    metrics_path = "outputs/generated_molecules.json"
    
    if not os.path.exists(metrics_path):
        return {
            "status": "not_computed",
            "message": "Metrics not yet computed. Run /generate first."
        }
    

    with open(metrics_path) as f:
        metrics = json.load(f)

    return {
        "metrics":metrics
    }

@app.get("/check-files")
def check_files():
    """
    Debug endpoint: Check which output files exist and their sizes.
    Useful for troubleshooting metric computation issues.
    """
    sdf_path = os.path.join(OUTPUT_DIR, "generated_molecules.sdf")
    json_path = os.path.join(OUTPUT_DIR, "generated_molecules.json")
    
    return {
        "sdf_exists": os.path.exists(sdf_path),
        "json_exists": os.path.exists(json_path),
        "sdf_size": os.path.getsize(sdf_path) if os.path.exists(sdf_path) else 0,
        "json_size": os.path.getsize(json_path) if os.path.exists(json_path) else 0,
        "output_dir_contents": os.listdir(OUTPUT_DIR) if os.path.exists(OUTPUT_DIR) else []
    }