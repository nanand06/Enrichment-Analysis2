/**
 * Enrichment Ratio Calculator - Renderer Process
 * Handles UI interactions and API communication for sequence enrichment analysis
 */

import './index.css';

const fileDialogFilters = [
  { name: 'Data Files', extensions: ['csv', 'tsv', 'txt', 'xlsx', 'xls'] },
  { name: 'CSV Files', extensions: ['csv'] },
  { name: 'TSV Files', extensions: ['tsv'] },
  { name: 'Text Files', extensions: ['txt'] },
  { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
  { name: 'All Files', extensions: ['*'] }
];

function bindFileBrowser(browseBtn, fileInput, pathInput, infoEl, pathRef, title) {
  if (browseBtn) {
    browseBtn.addEventListener('click', async () => {
      try {
        if (window.electronAPI?.openFileDialog) {
          const result = await window.electronAPI.openFileDialog({
            title,
            buttonLabel: title,
            filters: fileDialogFilters
          });
          if (!result.canceled && result.filePath) {
            pathRef.current = result.filePath;
            pathInput.value = result.fileName;
            infoEl.textContent = `Selected: ${result.fileName}`;
            infoEl.style.color = 'var(--success-color)';
            if (fileInput) fileInput.dataset.filePath = result.filePath;
          }
        } else if (fileInput) {
          fileInput.click();
        }
      } catch (err) {
        console.error('Error opening file dialog:', err);
        alert('Error opening file dialog. Please try again.');
      }
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files?.length > 0) {
        const file = e.target.files[0];
        pathInput.value = file.name;
        infoEl.textContent = `Selected: ${file.name} (${formatFileSize(file.size)})`;
        infoEl.style.color = 'var(--success-color)';
        pathRef.current = file.path || file.name;
      }
    });
  }
}

// File browser functionality using Electron IPC
function initFileBrowsers() {
  const pathRefs = {
    file1: { current: null },
    file2: { current: null },
    file3: { current: null },
    file4: { current: null }
  };
  const file1Path = document.getElementById('file1-input');
  const file2Path = document.getElementById('file2-input');
  const file3Path = document.getElementById('file3-input');
  const file4Path = document.getElementById('file4-input');
  bindFileBrowser(
    document.getElementById('browse-file1'),
    document.getElementById('file1-file-input'),
    file1Path,
    document.getElementById('file1-info'),
    pathRefs.file1,
    'Select Reference file'
  );
  bindFileBrowser(
    document.getElementById('browse-file2'),
    document.getElementById('file2-file-input'),
    file2Path,
    document.getElementById('file2-info'),
    pathRefs.file2,
    'Select Comparison file 1'
  );
  bindFileBrowser(
    document.getElementById('browse-file3'),
    document.getElementById('file3-file-input'),
    file3Path,
    document.getElementById('file3-info'),
    pathRefs.file3,
    'Select Comparison file 2'
  );
  bindFileBrowser(
    document.getElementById('browse-file4'),
    document.getElementById('file4-file-input'),
    file4Path,
    document.getElementById('file4-info'),
    pathRefs.file4,
    'Select Comparison file 3'
  );
  [file1Path, file2Path, file3Path, file4Path].forEach((el) => {
    if (el) el.addEventListener('focus', () => el.removeAttribute('readonly'));
  });

  return {
    getReferencePath: () => pathRefs.file1.current || file1Path?.value?.trim() || null,
    getComparisonPaths: () => {
      const out = [];
      const inputs = [file2Path, file3Path, file4Path];
      ['file2', 'file3', 'file4'].forEach((k, i) => {
        const p = pathRefs[k].current || inputs[i]?.value?.trim();
        if (p) out.push(p);
      });
      return out;
    }
  };
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Store full result for CSV export (all rows)
let lastFullResult = null;
let backendEndpoint = 'http://127.0.0.1:8000';

// Run analysis button
function initAnalysisButton() {
  const runButton = document.getElementById('run-analysis');
  const resultsContent = document.getElementById('results-content');
  const resultsPlaceholder = document.querySelector('.results-placeholder');

  if (runButton) {
    runButton.addEventListener('click', async () => {
      const referencePath = filePathGetters?.getReferencePath?.() || document.getElementById('file1-input')?.value?.trim();
      const comparisonPaths = filePathGetters?.getComparisonPaths?.() || [];
      const chainSelection = document.querySelector('input[name="chain-selection"]:checked')?.value;
      const sequenceType = document.getElementById('sequence-type')?.value;

      if (!referencePath) {
        alert('Please select the reference file');
        return;
      }
      if (!comparisonPaths.length) {
        alert('Please select at least one comparison file');
        return;
      }
      if (comparisonPaths.length > 3) {
        alert('Maximum 3 comparison files allowed');
        return;
      }
      if (!chainSelection) {
        alert('Please select a chain type (Heavy or Light)');
        return;
      }
      if (!sequenceType) {
        alert('Please select a sequence comparison value');
        return;
      }

      runButton.disabled = true;
      runButton.innerHTML = '<span class="btn-icon">⏳</span> Calculating Enrichment Ratios...';

      try {
        const response = await fetch(`${backendEndpoint}/api/store-files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referencePath,
            comparisonPaths,
            chainSelection,
            sequenceType
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (!result) throw new Error('Invalid response from server');
          lastFullResult = result;
          displayResults(result, {
            referencePath,
            comparisonPaths,
            chain: chainSelection,
            sequenceType
          });
          if (resultsPlaceholder) resultsPlaceholder.style.display = 'none';
          if (resultsContent) resultsContent.classList.remove('hidden');
        } else {
          const errorData = await response.json().catch(() => ({ detail: 'Analysis failed' }));
          throw new Error(errorData.detail || 'Analysis failed');
        }
      } catch (error) {
        console.error('Analysis error:', error);
        alert(`Failed to run analysis: ${error.message}\n\nMake sure the backend server is running at ${backendEndpoint}`);
      } finally {
        runButton.disabled = false;
        runButton.innerHTML = '<span class="btn-icon">▶</span> Calculate Enrichment Ratios';
      }
    });
  }
}

function displayResults(result, config) {
  if (!result) {
    console.error('displayResults called with null/undefined result');
    return;
  }

  updateSummary(config, result);

  // UI: Enrichment ratio first, then Sequence
  const uiHeaders = ['Enrichment ratio', 'Sequence'];
  updateTableHeaders(uiHeaders);

  const tableBody = document.getElementById('results-table-body');
  if (tableBody && result.data) {
    tableBody.innerHTML = '';
    const top10 = result.data.slice(0, 10);
    const seqKey = result.headers && result.headers[0] ? result.headers[0] : 'Sequence (reference)';
    top10.forEach((row, index) => {
      const tr = document.createElement('tr');
      const ratioCell = document.createElement('td');
      ratioCell.textContent = row.enrichment ?? row.data?.['enrichment_ratio file1'] ?? '';
      tr.appendChild(ratioCell);
      const seqCell = document.createElement('td');
      seqCell.textContent = row.data?.[seqKey] ?? '';
      tr.appendChild(seqCell);
      if (index % 2 === 0) tr.style.backgroundColor = 'var(--background)';
      tableBody.appendChild(tr);
    });
  }

  showStatusMessages(result);
}

function updateSummary(config, result) {
  const summaryFile1 = document.getElementById('summary-file1');
  const summaryFile2 = document.getElementById('summary-file2');
  const summaryChain = document.getElementById('summary-chain');
  const summarySequence = document.getElementById('summary-sequence');
  const summaryTotal = document.getElementById('summary-total');
  const summaryOutput = document.getElementById('summary-output');

  if (summaryFile1) summaryFile1.textContent = config.referencePath || config.file1 || '-';
  if (summaryFile2) {
    const comp = config.comparisonPaths || (config.file2 ? [config.file2] : []);
    summaryFile2.textContent = comp.length ? comp.map((p) => p.split(/[/\\]/).pop()).join(', ') : '-';
  }
  if (summaryChain) summaryChain.textContent = (config.chain || '').charAt(0).toUpperCase() + (config.chain || '').slice(1);
  if (summarySequence) summarySequence.textContent = config.sequenceType || '-';
  if (summaryTotal) summaryTotal.textContent = result?.total_sequences ?? result?.data?.length ?? 0;
  if (summaryOutput) summaryOutput.textContent = result?.output_file || 'Generated file';
}

function updateTableHeaders(headers) {
  const thead = document.querySelector('.results-table thead tr');
  if (!thead) return;
  thead.innerHTML = '';
  headers.forEach((header, index) => {
    const th = document.createElement('th');
    th.textContent = header;
    th.id = `dynamic-header-${index + 1}`;
    thead.appendChild(th);
  });
}

function showStatusMessages(result) {
  const statusContainer = document.getElementById('status-messages');
  if (!statusContainer) return;

  statusContainer.innerHTML = '';

  if (result.messages && result.messages.length > 0) {
    result.messages.forEach(msg => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `status-message ${msg.type || 'info'}`;
      messageDiv.textContent = msg.text || msg;
      statusContainer.appendChild(messageDiv);
    });
  }

  if (result.warnings && result.warnings.length > 0) {
    result.warnings.forEach(warning => {
      const warningDiv = document.createElement('div');
      warningDiv.className = 'status-message warning';
      warningDiv.textContent = `⚠️ ${warning}`;
      statusContainer.appendChild(warningDiv);
    });
  }
}

// Reset configuration button
function initResetButton() {
  const resetButton = document.getElementById('reset-config');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      ['file1', 'file2', 'file3', 'file4'].forEach((id) => {
        const input = document.getElementById(`${id}-input`);
        const fileInput = document.getElementById(`${id}-file-input`);
        const info = document.getElementById(`${id}-info`);
        if (input) input.value = '';
        if (fileInput) fileInput.value = '';
        if (info) info.textContent = '';
      });
      const chainHeavy = document.getElementById('chain-heavy');
      if (chainHeavy) chainHeavy.checked = true;
      const seqType = document.getElementById('sequence-type');
      if (seqType) seqType.selectedIndex = 0;
      lastFullResult = null;
      const resultsContent = document.getElementById('results-content');
      const resultsPlaceholder = document.querySelector('.results-placeholder');
      if (resultsContent) resultsContent.classList.add('hidden');
      if (resultsPlaceholder) resultsPlaceholder.style.display = 'block';
    });
  }
}

// Export results button: export ALL results to CSV (not just top 10)
function initExportButton() {
  const exportButton = document.getElementById('export-results');
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      if (!lastFullResult?.data?.length) {
        alert('No results to export. Please run an analysis first.');
        return;
      }
      const headers = lastFullResult.headers || [];
      const rows = [headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(',')];
      lastFullResult.data.forEach((row) => {
        const values = headers.map((h) => row.data?.[h] ?? '');
        rows.push(values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
      });
      const csv = rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = lastFullResult.output_file || `enrichment_results_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    });
  }
}

// Export unfound sequences (in comparison file(s) but not in reference)
function initExportUnfoundButton() {
  const btn = document.getElementById('export-unfound');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!lastFullResult) {
      alert('No results. Please run an analysis first.');
      return;
    }
    const headers = lastFullResult.unfound_headers || [];
    const data = lastFullResult.unfound_sequences || [];
    if (!data.length) {
      alert('No unfound sequences. All sequences in comparison files were found in the reference.');
      return;
    }
    const rows = [headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(',')];
    data.forEach((row) => {
      const values = headers.map((h) => row[h] ?? '');
      rows.push(values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lastFullResult.unfound_output_file || `unfound_sequences_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  });
}

// Refresh results button
function initRefreshButton() {
  const refreshButton = document.getElementById('refresh-results');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      const runButton = document.getElementById('run-analysis');
      if (runButton && !runButton.disabled) {
        runButton.click();
      } else {
        alert('Please configure and run a new analysis');
      }
    });
  }
}

// Store file path getters globally for use in analysis
let filePathGetters = null;

// Initialize all functionality when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  if (window.electronAPI?.getBackendPort) {
    const port = await window.electronAPI.getBackendPort();
    backendEndpoint = `http://127.0.0.1:${port}`;
  }

  filePathGetters = initFileBrowsers();
  initAnalysisButton();
  initResetButton();
  initExportButton();
  initExportUnfoundButton();
  initRefreshButton();
});
