
// Rodger Application Logic - Daily Sheet

const parser = new TransactionParser();
const ledger = new LedgerManager();


// DOM Elements
const views = {
    dashboard: document.getElementById('dashboard-view'),
    'old-records': document.getElementById('old-records-view')
};

const elements = {
    currentDateHeader: document.getElementById('current-date-header'),
    dailySheetTable: document.getElementById('daily-sheet-table'),
    dailySheetBody: document.getElementById('daily-sheet-body'),

    // Filters
    searchInput: document.getElementById('search-input'),
    dateFrom: document.getElementById('date-from'),
    dateTo: document.getElementById('date-to'),

    // Ledger Totals
    totalAmount: document.getElementById('total-amount'),
    totalCredit: document.getElementById('total-credit'),
    totalDebit: document.getElementById('total-debit'),
    totalExpense: document.getElementById('total-expense'),

    // Navigation
    navTabs: document.querySelectorAll('.nav-tab'),

    // History / Old Records
    oldRecordsBtn: document.getElementById('old-records-btn'),
    exportBtn: document.getElementById('export-btn'),
    historyDatePicker: document.getElementById('history-date-picker'),
    loadHistoryBtn: document.getElementById('load-history-btn'),
    historyBody: document.getElementById('history-body'),

    // Voice / Input
    voiceBtn: document.getElementById('voice-btn'),
    voiceOverlay: document.getElementById('voice-overlay'),
    voiceStatusText: document.getElementById('voice-status-text'),
    connectionStatus: document.getElementById('connection-status'),
    debugInput: document.getElementById('user-input'),
    debugSendBtn: document.getElementById('send-btn')
};

// Initialization
function init() {
    // Set default dates (Today)
    const today = new Date().toISOString().split('T')[0];
    elements.dateFrom.value = today;
    elements.dateTo.value = today;

    setupEventListeners();
    checkConnection();

    // Initial Render
    renderDashboard();
}

function checkConnection() {
    window.addEventListener('online', () => elements.connectionStatus.textContent = 'Online');
    window.addEventListener('offline', () => elements.connectionStatus.textContent = 'Offline');
}

// View Management
function showView(viewName) {
    Object.values(views).forEach(view => view.classList.remove('active', 'hidden'));
    Object.values(views).forEach(view => view.classList.add('hidden'));

    if (views[viewName]) {
        views[viewName].classList.remove('hidden');
        views[viewName].classList.add('active');
    }

    // Update Tab UI
    elements.navTabs.forEach(tab => {
        if (tab.dataset.target === viewName) {
            tab.classList.add('active');
        } else if (tab.dataset.target && viewName !== 'old-records') { // Don't clear tabs if in history
            tab.classList.remove('active');
        }
    });

    if (viewName === 'dashboard') renderDashboard();
}

// --- LEDGER FUNCTIONS ---

function renderDashboard() {
    const fromDate = elements.dateFrom.value;
    const toDate = elements.dateTo.value;
    const searchQuery = elements.searchInput.value.toLowerCase().trim();

    if (!fromDate || !toDate) return;

    // Get transactions for range
    let transactions = ledger.getTransactionsBetween(fromDate, toDate);

    // Filter by Search
    if (searchQuery) {
        transactions = transactions.filter(t =>
            t.customer_name.toLowerCase().includes(searchQuery)
        );
    }

    // Update Header
    if (fromDate === toDate) {
        const [y, m, d] = fromDate.split('-');
        elements.currentDateHeader.textContent = `Entries(${d} - ${m} - ${y})`;
    } else {
        elements.currentDateHeader.textContent = `Entries(${fromDate} to ${toDate})`;
    }

    renderTable(transactions, elements.dailySheetBody, true); // true = editable
    updateTotals(transactions);
}

function renderTable(sheet, tbody, isEditable = false) {
    tbody.innerHTML = '';
    if (sheet.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">No entries found</td></tr>';
        return;
    }

    sheet.forEach((entry, index) => {
        const tr = document.createElement('tr');
        // If entry has originalIndex, use it, otherwise use index (fallback, though getTransactionsBetween provides it)
        // But wait, if we are filtering, 'index' here is just the display index.
        // We need the original identifiers to edit/delete.
        // getTransactionsBetween returns objects with originalDate and originalIndex.
        // If we are just showing today's sheet directly from ledger.getTodaySheet(), it might not have those if we didn't add them.
        // Let's make sure renderDashboard always uses getTransactionsBetween for consistency, OR handle both.
        // Actually, getTransactionsBetween is safer.

        // However, for direct editing of today's sheet, we need to be careful.
        // If we use getTransactionsBetween, we get a copy.
        // Editing the copy won't update the original unless we use originalDate/Index.

        tr.dataset.originalDate = entry.originalDate || entry.date;
        tr.dataset.originalIndex = entry.originalIndex !== undefined ? entry.originalIndex : index;

        // Helper to create editable cell
        const createCell = (field, value, type = 'text') => {
            const td = document.createElement('td');
            td.textContent = value;
            if (isEditable && field !== 'sr_no' && field !== 'time' && field !== 'date') {
                td.contentEditable = true;
                td.dataset.field = field;
                td.addEventListener('blur', (e) => handleCellEdit(e, entry.originalDate, entry.originalIndex, field));
                td.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        e.target.blur();
                    }
                });
            }
            if (type === 'credit') td.className = 'credit';
            if (type === 'debit') td.className = 'debit';
            if (type === 'expense') td.className = 'expense';
            return td;
        };

        tr.appendChild(createCell('sr_no', entry.sr_no));
        tr.appendChild(createCell('customer_name', entry.customer_name));
        tr.appendChild(createCell('item_name', entry.item_name));
        tr.appendChild(createCell('amount', `₹${entry.amount} `)); // Note: stripping ₹ on edit might be needed
        tr.appendChild(createCell('time', entry.time)); // Time usually not editable? User said "all fields... date" but date is row. Time maybe.

        // For Due/Paid/Expense, we display them. If user edits, they edit the value.
        tr.appendChild(createCell('due', entry.due > 0 ? entry.due : '-', 'credit'));
        tr.appendChild(createCell('paid', entry.paid > 0 ? entry.paid : '-', 'debit'));
        tr.appendChild(createCell('expense', entry.expense > 0 ? entry.expense : '-', 'expense'));

        // Action Column (Delete)
        const actionTd = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.className = 'icon-btn';
        deleteBtn.style.color = '#ff4444';
        deleteBtn.onclick = () => handleDelete(entry.originalDate, entry.originalIndex);
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
    });
}

function handleCellEdit(e, dateStr, index, field) {
    const newValue = e.target.textContent.replace(/[^\d.-a-zA-Z\s]/g, '').trim();

    // If we don't have dateStr/index (e.g. legacy call), fallback?
    // But we ensured renderDashboard provides them.
    if (!dateStr || index === undefined) return;

    let updatedValue = newValue;
    if (['amount', 'due', 'paid', 'expense'].includes(field)) {
        updatedValue = parseFloat(newValue) || 0;
    }

    const updatedFields = {};
    updatedFields[field] = updatedValue;

    ledger.updateTransaction(dateStr, index, updatedFields);

    // Re-render to update totals and ensure consistency
    renderDashboard();
}

function handleDelete(dateStr, index) {
    if (confirm("Are you sure you want to delete this entry?")) {
        ledger.deleteTransaction(dateStr, index);

        if (views.dashboard.classList.contains('active')) {
            renderDashboard();
        } else if (views['old-records'].classList.contains('active')) {
            loadHistory();
        }
    }
}

function updateTotals(sheet) {
    let totalAmt = 0;
    let totalDue = 0;
    let totalPaid = 0;
    let totalExp = 0;

    sheet.forEach(e => {
        totalAmt += e.amount;
        totalDue += e.due;
        totalPaid += e.paid;
        totalExp += (e.expense || 0);
    });

    elements.totalAmount.textContent = `₹${totalAmt} `;
    elements.totalCredit.textContent = `₹${totalDue} `;
    elements.totalDebit.textContent = `₹${totalPaid} `;
    elements.totalExpense.textContent = `₹${totalExp} `;
}


// --- EVENT LISTENERS ---

function setupEventListeners() {
    // Navigation
    elements.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.target;

            // Handle view switching manually since we have hyphenated ID but camelCase var
            Object.values(views).forEach(v => v.classList.remove('active', 'hidden'));
            Object.values(views).forEach(v => v.classList.add('hidden'));

            let viewToShow;
            if (target === 'dashboard') viewToShow = views.dashboard;
            if (target === 'old-records') viewToShow = views['old-records'];

            if (viewToShow) {
                viewToShow.classList.remove('hidden');
                viewToShow.classList.add('active');
            }

            // Update Tab UI
            elements.navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            if (target === 'dashboard') renderDashboard();
        });
    });

    // Old Records
    elements.oldRecordsBtn.addEventListener('click', () => showView('old-records'));
    elements.loadHistoryBtn.addEventListener('click', loadHistory);

    // Exports
    elements.exportBtn.addEventListener('click', exportToCSV);

    // Filters
    elements.searchInput.addEventListener('input', renderDashboard);
    elements.dateFrom.addEventListener('change', renderDashboard);
    elements.dateTo.addEventListener('change', renderDashboard);

    // Debug Input
    elements.debugSendBtn.addEventListener('click', () => handleCommand(elements.debugInput.value));
    elements.debugInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCommand(elements.debugInput.value);
    });

    // Voice
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'hi-IN'; // Hindi/Hinglish
        recognition.interimResults = false;

        elements.voiceBtn.addEventListener('click', () => {
            recognition.start();
            elements.voiceOverlay.classList.remove('hidden');
            elements.voiceStatusText.textContent = "Listening...";
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            elements.voiceStatusText.textContent = `"${transcript}"`;
            setTimeout(() => {
                elements.voiceOverlay.classList.add('hidden');
                handleCommand(transcript);
            }, 1000);
        };

        recognition.onerror = (event) => {
            elements.voiceStatusText.textContent = "Error. Try again.";
            setTimeout(() => elements.voiceOverlay.classList.add('hidden'), 1500);
        };

        recognition.onend = () => {
            setTimeout(() => elements.voiceOverlay.classList.add('hidden'), 500);
        };
    } else {
        elements.voiceBtn.style.display = 'none';
    }
}

function handleCommand(text) {
    if (!text) return;
    console.log("Command:", text);

    try {
        // Default: Ledger Transaction
        const result = parser.parse(text);

        if (result.is_report) {
            showView('old-records');
            return;
        }

        if (!result.customer_name || !result.amount) {
            alert("Could not understand. Please mention name and amount.");
            return;
        }

        ledger.addTransaction(result);

        // Reset filters to today to show the new entry
        const today = new Date().toISOString().split('T')[0];
        elements.dateFrom.value = today;
        elements.dateTo.value = today;
        elements.searchInput.value = '';

        renderDashboard();

        elements.debugInput.value = '';

    } catch (e) {
        console.error(e);
        alert("Error processing command.");
    }
}

function loadHistory() {
    const dateVal = elements.historyDatePicker.value; // YYYY-MM-DD
    if (!dateVal) return;

    const [year, month, day] = dateVal.split('-');
    const formattedDate = `${day} -${month} -${year} `;

    const sheet = ledger.getSheet(formattedDate);

    const sheetWithMeta = sheet.map((entry, index) => ({
        ...entry,
        originalDate: formattedDate,
        originalIndex: index
    }));

    renderTable(sheetWithMeta, elements.historyBody, false);
}

function exportToCSV() {
    const fromDate = elements.dateFrom.value;
    const toDate = elements.dateTo.value;
    const transactions = ledger.getTransactionsBetween(fromDate, toDate);

    if (transactions.length === 0) { alert("No data"); return; }

    let csv = "Sr,Customer,Item,Amount,Time,Due,Paid,Expense,Date\n";
    transactions.forEach(row => {
        csv += `${row.sr_no},${row.customer_name},${row.item_name},${row.amount},${row.time},${row.due},${row.paid},${row.expense},${row.originalDate} \n`;
    });

    downloadCSV(csv, `Ledger_${fromDate}_to_${toDate}.csv`);
}


function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}



// Start
init();
