
// Rodger Application Logic - Daily Sheet

const parser = new TransactionParser();
const ledger = new LedgerManager();
const itemsMaster = new ItemsMasterList();


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
    debugSendBtn: document.getElementById('send-btn'),

    // Collapsible Menu
    itemsMenuToggle: document.getElementById('items-menu-toggle'),
    itemsMenuContent: document.getElementById('items-menu-content'),
    itemsTableBody: document.getElementById('items-table-body'),
    newItemInput: document.getElementById('new-item-input'),
    addItemBtn: document.getElementById('add-item-btn')
};

// Initialization
function init() {
    // Set default dates (Today)
    const today = new Date().toISOString().split('T')[0];
    elements.dateFrom.value = today;
    elements.dateTo.value = today;

    setupEventListeners();
    checkConnection();

    // Initialize Items Master List
    itemsMaster.populateFromLedger(ledger);

    // Initial Render
    renderDashboard();
    renderItemsMenu(); // Populate the items list initially
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

    renderTable(transactions, elements.dailySheetBody, true, false); // true = editable, false = showDateTime
    updateTotals(transactions);
}

function renderTable(sheet, tbody, isEditable = false, showDateTime = false) {
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
            if (isEditable && field !== 'sr_no' && field !== 'date' && field !== 'time') { // Time/Date usually auto-updated
                td.contentEditable = true;
                td.dataset.field = field;
                td.addEventListener('blur', (e) => {
                    // Delay hiding suggestions to allow click
                    setTimeout(() => hideSuggestions(), 200);
                    handleCellEdit(e, entry.originalDate, entry.originalIndex, field);
                });

                if (field === 'item_name') {
                    td.addEventListener('input', (e) => {
                        const val = e.target.innerText;
                        showSuggestions(e.target, val);
                    });
                    td.addEventListener('focus', (e) => {
                        showSuggestions(e.target, e.target.innerText);
                    });
                    td.addEventListener('keydown', (e) => {
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                            handleSuggestionNavigation(e);
                        }
                    });
                } else {
                    td.addEventListener('input', (e) => {
                        // Start of edits - visuals handled by contentEditable
                    });
                }

                td.addEventListener('keydown', (e) => {
                    // FIX: Allow new lines for text fields, prevent for others
                    if (e.key === 'Enter') {
                        if (field === 'customer_name' || field === 'item_name') {
                            if (suggestionsActive && field === 'item_name') {
                                e.preventDefault(); // Let suggestion handler take it
                                return;
                            }
                            // Allow default behavior (new line) -> Actually requirement says "Fill cell... Preserve others"
                            // If we hit enter on a selection, it should select.
                            // If just typing, maybe blur?
                            e.stopPropagation();
                        } else {
                            // Numeric fields: Submit/Blur on Enter
                            e.preventDefault();
                            e.target.blur();
                        }
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
        if (showDateTime) {
            const displayDate = entry.date || entry.originalDate;
            tr.appendChild(createCell('time', `${displayDate} ${entry.time}`));
        } else {
            tr.appendChild(createCell('time', entry.time));
        }

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
    // FIX: Allow all characters and preserve newlines using innerText
    const newValue = e.target.innerText.trim();

    // If we don't have dateStr/index (e.g. legacy call), fallback?
    if (!dateStr || index === undefined) return;

    // VALIDATION: Prevent empty values for text fields
    if (newValue === '' && (field === 'customer_name' || field === 'item_name')) {
        // Revert UI to previous state via re-render
        if (views['old-records'].classList.contains('active')) loadHistory();
        else renderDashboard();
        return;
    }

    let updatedValue = newValue;
    if (['amount', 'due', 'paid', 'expense'].includes(field)) {
        // Remove currency symbol and non-numeric chars (expect digits and dot)
        // If empty, default to 0
        const sanitized = newValue.replace(/[^\d.-]/g, '');
        updatedValue = parseFloat(sanitized) || 0;
    }

    const updatedFields = {};
    updatedFields[field] = updatedValue;

    // FIX: Update date and time on edit to capture exact moment of change
    const now = new Date();
    updatedFields['time'] = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    updatedFields['date'] = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

    if (field === 'item_name') {
        itemsMaster.addItem(updatedValue);
    }

    ledger.updateTransaction(dateStr, index, updatedFields);

    // Show Confirmation
    showToast("Entry Updated");

    // Re-render to update totals and ensure consistency.
    // Check which view is active to call the right render
    if (views['old-records'].classList.contains('active')) {
        loadHistory();
    } else {
        renderDashboard();
    }

    // Refresh items menu if item name changed or new one added
    if (field === 'item_name') {
        renderItemsMenu();
    }
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

    // Collapsible Menu Toggle
    if (elements.itemsMenuToggle) {
        elements.itemsMenuToggle.addEventListener('click', () => {
            elements.itemsMenuToggle.classList.toggle('active');
            elements.itemsMenuContent.classList.toggle('expanded');
        });
    }

    // Manual Add Item
    if (elements.addItemBtn && elements.newItemInput) {
        // Click
        elements.addItemBtn.addEventListener('click', () => handleManualAddItem());
        // Enter Key
        elements.newItemInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleManualAddItem();
        });
    }

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

    renderTable(sheetWithMeta, elements.historyBody, true, true); // Editable + Show Date&Time
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


// --- SUGGESTIONS DROPDOWN ---
let activeSuggestionIndex = -1;
let suggestionsActive = false;
let currentSuggestionCell = null;

function createSuggestionsDropdown() {
    let dropdown = document.querySelector('.suggestions-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'suggestions-dropdown';
        document.body.appendChild(dropdown);
    }
    return dropdown;
}

function showSuggestions(cell, query) {
    const dropdown = createSuggestionsDropdown();
    currentSuggestionCell = cell;

    // Get matching items
    const matches = itemsMaster.search(query);

    let displayItems = matches;
    if (!query) {
        // Show top 10 if nothing typed
        displayItems = itemsMaster.getItems().slice(0, 10);
    }

    if (displayItems.length === 0) {
        hideSuggestions();
        return;
    }

    // Render
    dropdown.innerHTML = '';
    displayItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = item;
        div.onmousedown = (e) => { e.preventDefault(); selectSuggestion(item); }; // onmousedown prevents blur issue better than onclick sometimes
        if (index === activeSuggestionIndex) div.classList.add('active');
        dropdown.appendChild(div);
    });

    // Position
    const rect = cell.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + window.scrollY}px`;
    dropdown.style.minWidth = `${rect.width}px`;
    dropdown.style.width = 'auto'; // allow expansion
    dropdown.style.display = 'block';

    suggestionsActive = true;
    activeSuggestionIndex = -1;
}

function hideSuggestions() {
    const dropdown = document.querySelector('.suggestions-dropdown');
    if (dropdown) dropdown.style.display = 'none';
    suggestionsActive = false;
    currentSuggestionCell = null;
}

function selectSuggestion(value) {
    if (currentSuggestionCell) {
        currentSuggestionCell.innerText = value;
        // Trigger blur to save
        currentSuggestionCell.blur();
    }
    hideSuggestions();
}

function handleSuggestionNavigation(e) {
    const dropdown = document.querySelector('.suggestions-dropdown');
    if (!dropdown || dropdown.style.display === 'none') return;

    const items = dropdown.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestionIndex++;
        if (activeSuggestionIndex >= items.length) activeSuggestionIndex = 0;
        updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestionIndex--;
        if (activeSuggestionIndex < 0) activeSuggestionIndex = items.length - 1;
        updateActiveSuggestion(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
            selectSuggestion(items[activeSuggestionIndex].textContent);
        }
    }
}

function updateActiveSuggestion(items) {
    items.forEach(item => item.classList.remove('active'));
    if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
        items[activeSuggestionIndex].classList.add('active');
        items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
    }
}


// --- ITEMS MENU FUNCTIONS ---

function renderItemsMenu() {
    const items = itemsMaster.getItems(); // Now returns [{name, date}, ...]
    elements.itemsTableBody.innerHTML = '';

    if (items.length === 0) {
        elements.itemsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-secondary);">No items found</td></tr>';
        return;
    }

    items.forEach((itemObj, index) => {
        const tr = document.createElement('tr');

        // Sr No
        const tdSr = document.createElement('td');
        tdSr.textContent = index + 1;
        tr.appendChild(tdSr);

        // Item Name
        const tdName = document.createElement('td');
        tdName.textContent = itemObj.name;
        tr.appendChild(tdName);

        // Date Added
        const tdDate = document.createElement('td');
        tdDate.textContent = itemObj.date || '-';
        tr.appendChild(tdDate);

        // Action
        const tdAction = document.createElement('td');
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.className = 'icon-btn';
        deleteBtn.style.color = '#ff4444';
        deleteBtn.title = 'Delete Item';
        deleteBtn.onclick = () => handleItemDelete(itemObj.name); // Pass name string
        tdAction.appendChild(deleteBtn);
        tr.appendChild(tdAction);

        elements.itemsTableBody.appendChild(tr);
    });
}

function handleManualAddItem() {
    const val = elements.newItemInput.value.trim();
    if (!val) return;

    const success = itemsMaster.addItem(val);
    if (success) {
        elements.newItemInput.value = '';
        renderItemsMenu();
        // Optional: Scroll to bottom of list
        // elements.itemsTableBody.lastElementChild.scrollIntoView({ behavior: 'smooth' });
    } else {
        alert("Item already exists or invalid.");
    }
}

function handleItemDelete(itemName) {
    if (confirm(`Are you sure you want to delete "${itemName}"? This will mark past entries as [Deleted].`)) {
        const success = itemsMaster.deleteItem(itemName, ledger);
        if (success) {
            renderItemsMenu();
            // Refresh dashboard in case visible entries were updated
            renderDashboard();
        } else {
            alert("Error deleting item.");
        }
    }
}


// Start
init();
