// Rodger Logic Handling - Daily Sheet Architecture

class TransactionParser {
    constructor() {
        this.currencySymbol = '₹';
    }

    parse(input) {
        const result = {
            customer_name: null,
            amount: null,
            currency: "INR",
            type: null, // 'due' (baki) or 'paid' (jama)
            item: null,
            date: null, // YYYY-MM-DD
            displayDate: null, // DD-MM-YYYY
            time: null,
            is_report: false
        };

        const lowerInput = input.toLowerCase();

        // 1. Check for Report Request
        if (lowerInput.includes('old records') || lowerInput.includes('history') || lowerInput.includes('purana')) {
            result.is_report = true;
            return result;
        }

        // 2. Extract Amount
        // Look for number followed optionally by rs/rupees/- or Hindi equivalents
        const amountMatch = input.match(/₹?\s?(\d+)(?:\s?(?:rs|rupees|rupaye|\/-|रुपये|रूपये))?/i);
        if (amountMatch) {
            result.amount = parseFloat(amountMatch[1]);
        }

        // 3. Extract Type (Income, Receivable, Expense)
        // Rules:
        // Income: 'Jama', 'Received', 'Paisa mila', 'Deposit', 'जमा', 'दिया', 'दिए', 'मिले', 'आये', 'प्राप्त'
        // Receivable: 'Udhar', 'Baki', 'Lena hai', 'Credit due', 'बाकी', 'उधार', 'लेना है', 'बकाया'
        // Expense: 'Dena hai', 'Kharcha', 'Expense', 'Payment given', 'देना है', 'खर्चा', 'व्यय'

        if (lowerInput.match(/(jama|received|paisa mila|deposit|diya|diye|mile|aaye|got|paid|credit|जमा|दिया|दिए|मिले|आये|प्राप्त)/)) {
            result.type = 'income';
        }
        else if (lowerInput.match(/(udhar|baki|lena hai|credit due|debit|due|bakaya|बाकी|उधार|लेना है|बकाया)/)) {
            result.type = 'receivable';
        }
        else if (lowerInput.match(/(dena hai|kharcha|expense|payment given|payment|paid to|देना है|खर्चा|व्यय)/)) {
            result.type = 'expense';
        }
        else {
            // Context inference
            if (lowerInput.includes(' se ') || lowerInput.includes(' से ')) result.type = 'income'; // Sohan se mile (Income)
            else if (lowerInput.includes(' ko ') || lowerInput.includes(' को ')) result.type = 'receivable'; // Rakesh ko diye (Receivable/Due)
            else result.type = 'receivable'; // Default
        }

        // 4. Extract Customer Name
        // Strategy: Look for name at the start or before specific particles
        const nameRegex = /^([A-Za-z\u0900-\u097F\s]+?)(?:\s+(?:ji|bhai|sir|mam|जी|भाई|सर|मैम))?\s+(?:ke|se|ko|ne|ka|के|से|को|ने|का)/i;
        const nameMatch = input.match(nameRegex);

        if (nameMatch) {
            result.customer_name = this.capitalize(nameMatch[1].trim());
        } else {
            // Fallback: First word(s) that look like a name
            const words = input.split(' ');
            if (words.length > 0 && !this.isKeyword(words[0])) {
                // Simple heuristic: take first word as name if not found by regex
                result.customer_name = this.capitalize(words[0]);
            }
        }

        // 5. Extract Item
        // Remove Name, Amount, and Keywords from the input string to find the Item
        let description = input;

        // Remove Amount
        if (amountMatch) {
            description = description.replace(amountMatch[0], '');
        }

        // Remove Name (if found via regex)
        if (nameMatch) {
            description = description.replace(nameMatch[0], '');
        } else if (result.customer_name) {
            // If found via fallback, remove it
            const namePattern = new RegExp(`${result.customer_name}(?:\\s+(?:ji|bhai|sir|mam|जी|भाई|सर|मैम))?`, 'i');
            description = description.replace(namePattern, '');
        }

        // Remove Keywords
        const keywords = [
            'ke', 'se', 'ko', 'ne', 'ka', 'baki', 'udhaar', 'diya', 'lena', 'mile', 'jama', 'diye', 'aaye', 'rupaye', 'rs', 'credit', 'debit', 'hai', 'h', 'aur', 'and', 'bakaya', 'liya', 'liye', 'paid', 'due', 'deposit',
            'के', 'से', 'को', 'ने', 'का', 'बाकी', 'उधार', 'दिया', 'लेना', 'मिले', 'जमा', 'दिए', 'आये', 'रुपये', 'रूपये', 'है', 'और', 'बकाया', 'लिया', 'लिए', 'प्राप्त'
        ];
        keywords.forEach(k => {
            description = description.replace(new RegExp(`\\b${k}\\b`, 'gi'), '');
        });

        // Clean up
        result.item = description.replace(/[^\w\s\u0900-\u097F]/gi, '').trim();
        if (!result.item) result.item = '-';

        // 6. Date & Time
        const now = new Date();
        result.date = now.toISOString().split('T')[0]; // YYYY-MM-DD
        result.displayDate = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        result.time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

        return result;
    }

    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    isKeyword(word) {
        const keywords = [
            'Add', 'Show', 'Send', 'Credit', 'Debit', 'Rupees', 'Rs', 'Baki', 'Jama', 'Udhaar', 'Paid', 'Due',
            'जोड़ें', 'दिखाएं', 'भेजें', 'क्रेडिट', 'डेबिट', 'रुपये', 'बाकी', 'जमा', 'उधार'
        ];
        return keywords.includes(word);
    }
}

class LedgerManager {
    constructor() {
        // Storage Structure: { "DD-MM-YYYY": [ { sr_no, customer, item, amount, time, due, paid, expense } ] }
        this.sheets = JSON.parse(localStorage.getItem('rodger_daily_sheets')) || {};
    }

    addTransaction(parsedData) {
        // Validate
        if (!parsedData.customer_name || !parsedData.amount) {
            throw new Error("Missing customer name or amount.");
        }

        const sheetDate = parsedData.displayDate; // DD-MM-YYYY

        if (!this.sheets[sheetDate]) {
            this.sheets[sheetDate] = [];
        }

        const currentSheet = this.sheets[sheetDate];
        const srNo = currentSheet.length + 1;

        const entry = {
            sr_no: srNo,
            customer_name: parsedData.customer_name,
            item_name: parsedData.item,
            amount: parsedData.amount,
            date: sheetDate,
            time: parsedData.time,
            due: parsedData.type === 'receivable' ? parsedData.amount : 0,
            paid: parsedData.type === 'income' ? parsedData.amount : 0,
            expense: parsedData.type === 'expense' ? parsedData.amount : 0
        };

        currentSheet.push(entry);
        this.save();
        return entry;
    }

    save() {
        localStorage.setItem('rodger_daily_sheets', JSON.stringify(this.sheets));
    }

    getSheet(dateStr) {
        // dateStr format: DD-MM-YYYY
        return this.sheets[dateStr] || [];
    }

    getTodaySheet() {
        const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
        return this.getSheet(today);
    }

    getTodayDate() {
        return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    }
    updateTransaction(dateStr, index, updatedFields) {
        // dateStr: DD-MM-YYYY
        if (!this.sheets[dateStr] || !this.sheets[dateStr][index]) return;

        const entry = this.sheets[dateStr][index];

        // Update fields
        Object.keys(updatedFields).forEach(key => {
            entry[key] = updatedFields[key];
        });

        // Recalculate derived fields if amount/type changed (though UI usually passes exact values)
        // For simplicity, we assume UI passes correct due/paid/expense values if they are edited directly.
        // If amount is edited, we might need to infer, but the requirement says "correct any cell directly".
        // So we trust the passed updatedFields.

        this.save();
        return entry;
    }

    deleteTransaction(dateStr, index) {
        if (!this.sheets[dateStr]) return;

        this.sheets[dateStr].splice(index, 1);

        // Re-index Sr. No.
        this.sheets[dateStr].forEach((entry, i) => {
            entry.sr_no = i + 1;
        });

        this.save();
    }

    getTransactionsBetween(startDateStr, endDateStr) {
        // startDateStr, endDateStr are YYYY-MM-DD
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        const allTransactions = [];

        Object.keys(this.sheets).forEach(dateKey => {
            // dateKey is DD-MM-YYYY
            const [day, month, year] = dateKey.split('-');
            const sheetDate = new Date(`${year}-${month}-${day}`);
            sheetDate.setHours(0, 0, 0, 0);

            if (sheetDate >= start && sheetDate <= end) {
                this.sheets[dateKey].forEach((entry, index) => {
                    // Add metadata for deletion/editing
                    // We return a shallow copy with metadata, but we must be careful if we want to edit.
                    // Actually, for editing, we just need the keys.
                    allTransactions.push({
                        ...entry,
                        originalDate: dateKey,
                        originalIndex: index
                    });
                });
            }
        });

        // Sort by Date then Time (optional, but good for UX)
        // For now, just return as is or maybe sort by date?
        // Let's sort by Date descending (newest first) or ascending? 
        // Original daily sheet is likely chronological.
        // Let's sort by Date Ascending.
        allTransactions.sort((a, b) => {
            const [d1, m1, y1] = a.originalDate.split('-');
            const [d2, m2, y2] = b.originalDate.split('-');
            const dateA = new Date(`${y1}-${m1}-${d1}`);
            const dateB = new Date(`${y2}-${m2}-${d2}`);
            return dateA - dateB || a.sr_no - b.sr_no;
        });

        return allTransactions;
    }
}


