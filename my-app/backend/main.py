from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
import os
from pathlib import Path
import pandas as pd
import io
from datetime import datetime
from bio import Process
app = FastAPI(title="Enrichment Analysis API", version="1.0.0")


class RequestData(BaseModel):
    referencePath: str
    comparisonPaths: List[str]  # 1 to 3 comparison files
    chainSelection: str
    sequenceType: str

# Configure CORS to allow requests from your Electron app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Example data models
class AnalysisRequest(BaseModel):
    data: List[dict]
    options: Optional[dict] = None

class AnalysisResponse(BaseModel):
    result: dict
    status: str

# Example endpoints
@app.get("/")
async def root():
    return {"message": "Enrichment Analysis API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_data(request: AnalysisRequest):
    """
    Example analysis endpoint
    Modify this based on your enrichment analysis needs
    """
    try:
        # Your analysis logic here
        result = {
            "processed_items": len(request.data),
            "analysis": "completed"
        }
        return AnalysisResponse(result=result, status="success")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/data")
async def get_data():
    """Example GET endpoint"""
    return {"data": "example data"}

@app.post("/api/store-files")
async def store_files(data: RequestData):
    """
    Run enrichment: reference file vs 1–3 comparison files.
    Uses the 'Sequence' column only; sequenceType is just the comparison label in the output CSV (no column check).
    """
    try:
        if not data.comparisonPaths or len(data.comparisonPaths) > 3:
            raise HTTPException(
                status_code=400,
                detail="Provide 1 to 3 comparison file paths."
            )
        ref_df = Process.load_file(data.referencePath)
        comparison_dfs = [Process.load_file(p) for p in data.comparisonPaths]
        headers, enrichment_results, unfound_headers, unfound_sequences = Process.perform_enrichment(
            ref_df, comparison_dfs, data.sequenceType
        )
        for row in enrichment_results:
            row.pop("sort_key", None)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"enrichment_results_{timestamp}.csv"
        unfound_output_file = f"unfound_sequences_{timestamp}.csv"
        return {
            "headers": headers,
            "data": enrichment_results,
            "total_sequences": len(enrichment_results),
            "output_file": output_file,
            "comparison_value": data.sequenceType,
            "unfound_headers": unfound_headers,
            "unfound_sequences": unfound_sequences,
            "unfound_output_file": unfound_output_file,
            "messages": [
                {"type": "success", "text": f"Analysis completed for {data.chainSelection} chain"},
                {"type": "info", "text": f"Comparison value: {data.sequenceType}"}
            ],
            "warnings": [],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"File not found: {str(e)}")
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="One or more files are empty")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)

