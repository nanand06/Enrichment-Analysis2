import pandas as pd
from pathlib import Path
import numpy as np


def _to_jsonable(val):
    """Convert numpy/pandas types to native Python for JSON serialization."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return ""
    if isinstance(val, (np.integer, np.int64, np.int32)):
        return int(val)
    if isinstance(val, (np.floating, np.float64, np.float32)):
        return float(val)
    if isinstance(val, (np.bool_, bool)):
        return bool(val)
    if pd.isna(val):
        return ""
    return str(val) if not isinstance(val, (str, int, float)) else val


class Process:
    
    @staticmethod
    def load_file(file_path):
        """
        Load a file (CSV, TSV, Excel, or TXT) with proper encoding detection.
        Handles various file formats and encodings automatically.
        """
        file_path_obj = Path(file_path)
        file_extension = file_path_obj.suffix.lower()
        
        # Handle Excel files
        if file_extension in ['.xlsx', '.xls']:
            try:
           
                return pd.read_excel(file_path)
            except Exception as e:
                raise ValueError(f"Error reading Excel file: {str(e)}")
        
        # Handle text files (CSV, TSV, TXT)
        # Try to detect delimiter and encoding
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252', 'windows-1252']
        
        # Determine delimiter based on extension
        if file_extension == '.tsv':
            delimiter = '\t'
        elif file_extension in ['.csv', '.txt']:
            delimiter = ','  # Default to comma, will try to auto-detect
        else:
            delimiter = ','  # Default
        
        # Try reading with different encodings
        last_error = None
        for encoding in encodings:
            try:
                # First attempt: try with specified delimiter
                df = pd.read_csv(
                    file_path,
                    encoding=encoding,
                    delimiter=delimiter,
                    low_memory=False
                )
                return df
            except UnicodeDecodeError:
                # Try next encoding
                last_error = f"Failed to decode with {encoding}"
                continue
            except pd.errors.ParserError:
                # If delimiter is wrong, try auto-detection
                try:
                    df = pd.read_csv(
                        file_path,
                        encoding=encoding,
                        sep=None,  # Auto-detect delimiter
                        engine='python',
                        low_memory=False
                    )
                    return df
                except Exception as e:
                    last_error = str(e)
                    continue
        
        # If all encodings failed, raise an error
        raise ValueError(f"Could not read file with any encoding. Last error: {last_error}") 
    
    @staticmethod
    def _get_sequence_column(df):
        """
        Get the 'Sequence' column from a dataframe (case-insensitive).
        Enrichment always uses this column; the dropdown selection is only the comparison label in the CSV.
        """
        if "Sequence" in df.columns:
            return "Sequence"
        for c in df.columns:
            if c.lower() == "sequence":
                return c
        raise ValueError(
            f"Reference file is missing a 'Sequence' column. "
            f"Available columns: {sorted(list(df.columns))}"
        )

    @staticmethod
    def perform_enrichment(ref_df, comparison_dfs, sequence_type):
        """
        Calculate enrichment ratios using the 'Sequence' column only.
        sequence_type is not validated; it is only used as the comparison label in the output CSV.
        """
        ref_col = Process._get_sequence_column(ref_df)
        comp_cols = []
        for i, cdf in enumerate(comparison_dfs):
            if ref_col in cdf.columns:
                comp_cols.append(ref_col)
            else:
                found = None
                for c in cdf.columns:
                    if c.lower() == ref_col.lower():
                        found = c
                        break
                if found is None:
                    raise ValueError(
                        f"Comparison file {i + 1} is missing a 'Sequence' column. "
                        f"Available: {sorted(list(cdf.columns))}"
                    )
                comp_cols.append(found)

        n_comp = len(comparison_dfs)
        ref_ser = ref_df[ref_col].dropna()
        ref_counts = ref_ser.value_counts().to_dict()
        ref_total = len(ref_ser)

        comp_counts_list = []
        comp_totals = []
        for cdf, col in zip(comparison_dfs, comp_cols):
            ser = cdf[col].dropna()
            comp_counts_list.append(ser.value_counts().to_dict())
            comp_totals.append(len(ser))

        all_sequences = set(ref_counts.keys())
        for d in comp_counts_list:
            all_sequences |= set(d.keys())

        ref_first_row = ref_df.drop_duplicates(subset=[ref_col], keep="first").set_index(ref_col)
        other_cols = [c for c in ref_df.columns if c != ref_col and c.strip().lower() != "cluster count"]

        results = []
        for seq in all_sequences:
            ref_count = ref_counts.get(seq, 0)
            ref_freq = ref_count / ref_total if ref_total else 0
            comp_freqs = []
            enrichments = []
            for i in range(n_comp):
                cnt = comp_counts_list[i].get(seq, 0)
                tot = comp_totals[i] or 1
                comp_freqs.append(cnt / tot)
                if ref_count == 0 or ref_freq == 0:
                    enrichments.append("n.f.")
                else:
                    enrichments.append(round((cnt / tot) / ref_freq, 6))

            seq_str = str(seq)
            row_data = {
                "Sequence (reference)": seq_str,
                "Frequency (reference)": _to_jsonable(round(ref_freq, 6) if ref_freq else 0),
            }
            for i in range(n_comp):
                row_data[f"Sequence (comparison file {i + 1})"] = seq_str
                row_data[f"Frequency (comparison file {i + 1})"] = _to_jsonable(round(comp_freqs[i], 6))
            for i in range(n_comp):
                row_data[f"enrichment_ratio file{i + 1}"] = enrichments[i]

            for col in other_cols:
                if seq in ref_first_row.index:
                    try:
                        v = ref_first_row.loc[seq, col] if col in ref_first_row.columns else ""
                        row_data[col] = _to_jsonable(v)
                    except Exception:
                        row_data[col] = ""
                else:
                    row_data[col] = ""

            first_enrichment = enrichments[0] if enrichments else "n.f."
            sort_key = first_enrichment if first_enrichment != "n.f." else -1.0

            results.append({
                "enrichment": first_enrichment,
                "sort_key": sort_key,
                "data": row_data,
            })

        results.sort(key=lambda x: x["sort_key"], reverse=True)

        headers = ["Sequence (reference)", "Frequency (reference)"]
        for i in range(n_comp):
            headers.append(f"Sequence (comparison file {i + 1})")
            headers.append(f"Frequency (comparison file {i + 1})")
        for i in range(n_comp):
            headers.append(f"enrichment_ratio file{i + 1}")
        headers.extend(other_cols)

        # Unfound sequences: in comparison file(s) but not in reference; one row per (sequence, comparison file)
        comp_first_row = []
        all_other_comp = set()
        for i, cdf in enumerate(comparison_dfs):
            col = comp_cols[i]
            comp_first_row.append(
                cdf.drop_duplicates(subset=[col], keep="first").set_index(col)
            )
            for c in cdf.columns:
                if c != col and c.strip().lower() != "cluster count":
                    all_other_comp.add(c)
        unfound_headers = ["Sequence", "Comparison file", "Frequency"] + sorted(all_other_comp)
        unfound_sequences = []
        for seq in all_sequences:
            if ref_counts.get(seq, 0) > 0:
                continue
            seq_str = str(seq)
            for i in range(n_comp):
                if comp_counts_list[i].get(seq, 0) == 0:
                    continue
                tot = comp_totals[i] or 1
                freq = comp_counts_list[i].get(seq, 0) / tot
                other_comp = [c for c in comparison_dfs[i].columns if c != comp_cols[i] and c.strip().lower() != "cluster count"]
                row_data = {"Sequence": seq_str, "Comparison file": f"comparison file {i + 1}", "Frequency": _to_jsonable(round(freq, 6))}
                for c in unfound_headers[3:]:
                    row_data[c] = ""
                if seq in comp_first_row[i].index:
                    for col in other_comp:
                        try:
                            v = comp_first_row[i].loc[seq, col] if col in comp_first_row[i].columns else ""
                            row_data[col] = _to_jsonable(v)
                        except Exception:
                            row_data[col] = ""
                unfound_sequences.append(row_data)

        return headers, results, unfound_headers, unfound_sequences
    
    
if __name__ == "__main__":
    df = Process.load_file("C:/Users/bluef/Enrichment_Analysis_2/Enrichment_Analysis_Output/Igblast_Combined_Modified_Percentage_CDR1_CDR2_CDR3_90.xlsx")
    print(df.head())