const express = require('express');
const { Customer, Account, Transaction } = require('./models');
const store = require('./store');
const MockClient = require('./bankz');
const { v4: uuidv4 } = require('uuid');

/**
 * The `app` variable is an instance of an Express application.
 * Express is a minimal and flexible Node.js web application framework
 * that provides a robust set of features for building web and mobile applications.
 * It is commonly used to create APIs and handle HTTP requests and responses.
 */
const app = express();
const cors = require('cors');
const bankzClient = new MockClient(); // Global client for simplicity

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cors());

app.post('/api/customers', (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
        return res.status(400).json({ errors: ['Invalid request body'] });
    }

    const errors = [];
    if (name.trim() === '') {
        errors.push('Name cannot be empty');
    }
    const nameRegex = /^[a-zA-Z\s]+$/;
    if (name.trim() !== '' && !nameRegex.test(name)) {
        errors.push('Name must contain only letters and spaces');
    }
    if (email.trim() === '') {
        errors.push('Email cannot be empty');
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (email.trim() !== '' && !emailRegex.test(email)) {
        errors.push('Invalid email format');
    }
    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const customerId = uuidv4();
    const currentAccountId = uuidv4();
    const savingsAccountId = uuidv4();
    const bonusTransactionId = uuidv4();
    const now = new Date();

    const customer = new Customer(customerId, name, email);
    store.addCustomer(customer);

    const currentAccount = new Account(
        currentAccountId,
        customerId,
        'current',
        0.0,
        now
    );
    store.addAccount(currentAccount);

    const savingsAccount = new Account(
        savingsAccountId,
        customerId,
        'savings',
        500.0,
        now
    );
    store.addAccount(savingsAccount);

    const bonusTransaction = new Transaction(
        bonusTransactionId,
        savingsAccountId,
        customerId,
        'bonus',
        500.0,
        null,
        null,
        now
    );
    store.addTransaction(bonusTransaction);

    const response = {
        customerId: customerId,
        currentAccountId: currentAccountId,
        savingsAccountId: savingsAccountId
    };
    console.log(`Created customer: ${JSON.stringify(response)}`); // Debug log
    res.status(201).json(response);
});

app.get('/api/customers/:customerId/accounts', (req, res) => {
    const customerId = req.params.customerId;

    const customer = store.getCustomerById(customerId);
    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    const accounts = store.getAccountsByCustomerId(customerId);
    if (accounts.length === 0) {
        return res.status(404).json({ error: 'No accounts found for customer' });
    }

    const response = {
        customerId: customerId,
        accounts: accounts.map(account => ({
            id: account.id,
            customerId: account.customerId,
            type: account.type,
            balance: account.balance,
            createdAt: account.createdAt.toISOString()
        }))
    };
    console.log(`Fetched accounts for customer ${customerId}: ${accounts.map(acc => acc.id)}`); // Debug log
    res.status(200).json(response);
});

app.post('/api/customers/:customerId/transfers', (req, res) => {
    const customerId = req.params.customerId;
    const { fromAccountId, toAccountId, amount } = req.body;

    if (!fromAccountId || !toAccountId || !amount) {
        return res.status(400).json({ errors: ['Invalid request body'] });
    }

    const errors = [];
    if (fromAccountId.trim() === '') {
        errors.push('From account ID cannot be empty');
    }
    if (toAccountId.trim() === '') {
        errors.push('To account ID cannot be empty');
    }
    if (typeof amount !== 'number' || amount <= 0) {
        errors.push('Amount must be positive');
    }
    if (fromAccountId === toAccountId && fromAccountId) {
        errors.push('Cannot transfer to the same account');
    }
    if (errors.length > 0) {
        return res.status(400).json({ errors });
    }

    const customer = store.getCustomerById(customerId);
    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    // Get OAuth token
    let token;
    try {
        token = bankzClient.getToken();
    } catch (e) {
        return res.status(500).json({ error: 'Failed to authenticate with Bank Z' });
    }

    // Check fromAccount
    const fromAccount = store.getAccountById(fromAccountId);
    console.log(`Looking up fromAccountID ${fromAccountId}: found=${!!fromAccount}`); // Debug log
    if (!fromAccount) {
        return res.status(400).json({ error: `Source account ${fromAccountId} not found` });
    }
    if (fromAccount.customerId !== customerId) {
        return res.status(400).json({ error: 'Source account does not belong to the customer' });
    }

    // Check toAccount
    let isExternalTransfer = false;
    let toAccount = store.getAccountById(toAccountId);
    console.log(`Looking up toAccountID ${toAccountId}: found=${!!toAccount}`); // Debug log
    if (!toAccount) {
        try {
            bankzClient.getBalance(toAccountId, token);
            isExternalTransfer = true;
        } catch (e) {
            return res.status(400).json({ error: `Destination account ${toAccountId} not found` });
        }
    } else if (toAccount.customerId !== customerId) {
        return res.status(400).json({ error: 'Destination account does not belong to the customer' });
    }

    if (isExternalTransfer) {
        // Bank Z transfer
        if (fromAccount.balance < amount) {
            return res.status(400).json({ error: 'Insufficient funds' });
        }
        let transactionId;
        try {
            transactionId = bankzClient.initiateTransfer(fromAccountId, toAccountId, token, amount);
        } catch (e) {
            return res.status(400).json({ error: e.message });
        }

        // Update local account balance
        fromAccount.balance -= amount;
        store.updateAccount(fromAccount);

        // Record transaction
        const now = new Date();
        store.addTransaction(new Transaction(
            transactionId,
            fromAccountId,
            customerId,
            'bankz_transfer',
            amount,
            fromAccountId,
            toAccountId,
            now
        ));

        const response = {
            transactionId: transactionId,
            status: 'success'
        };
        console.log(`Bank Z transfer successful: ${JSON.stringify(response)}`); // Debug log
        return res.status(201).json(response);
    }

    // Internal transfer
    let fee = 0.0;
    if (fromAccount.type === 'current') {
        fee = amount * 0.0005;
    }

    const totalDeduction = amount + fee;
    if (fromAccount.balance < totalDeduction) {
        return res.status(400).json({ error: 'Insufficient funds' });
    }

    let interest = 0.0;
    if (toAccount.type === 'savings') {
        interest = amount * 0.005;
    }

    fromAccount.balance -= totalDeduction;
    toAccount.balance += amount + interest;
    store.updateAccount(fromAccount);
    store.updateAccount(toAccount);

    const now = new Date();
    const transferTransactionId = uuidv4();
    store.addTransaction(new Transaction(
        transferTransactionId,
        fromAccountId,
        customerId,
        'transfer',
        amount,
        fromAccountId,
        toAccountId,
        now
    ));

    if (fee > 0) {
        const feeTransactionId = uuidv4();
        store.addTransaction(new Transaction(
            feeTransactionId,
            fromAccountId,
            customerId,
            'fee',
            fee,
            null,
            null,
            now
        ));
    }

    if (interest > 0) {
        const interestTransactionId = uuidv4();
        store.addTransaction(new Transaction(
            interestTransactionId,
            toAccountId,
            customerId,
            'interest',
            interest,
            null,
            null,
            now
        ));
    }

    const response = {
        transactionId: transferTransactionId,
        status: 'success'
    };
    console.log(`Internal transfer successful: ${JSON.stringify(response)}`); // Debug log
    res.status(201).json(response);
});

app.get('/api/customers/:customerId/bankz/balances', (req, res) => {
    const customerId = req.params.customerId;

    const customer = store.getCustomerById(customerId);
    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    // Get OAuth token
    let token;
    try {
        token = bankzClient.getToken();
    } catch (e) {
        return res.status(500).json({ error: 'Failed to authenticate with Bank Z' });
    }

    const linkedAccountIds = ['bankz-acc-123', 'bankz-acc-456'];

    const balances = [];
    for (const accountId of linkedAccountIds) {
        try {
            const balance = bankzClient.getBalance(accountId, token);
            balances.push({
                accountId: accountId,
                balance: balance
            });
        } catch (e) {
            continue; // Skip invalid accounts
        }
    }

    const response = {
        customerId: customerId,
        balances: balances
    };
    res.status(200).json(response);
});

app.get('/api/customers/:customerId/transactions', (req, res) => {
    const customerId = req.params.customerId;

    // Verify customer exists
    const customer = store.getCustomerById(customerId);
    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    // Get query parameters for filtering
    const accountId = req.query.accountId;
    const transactionType = req.query.type;

    // Fetch transactions
    let transactions = store.getTransactionsByCustomerId(customerId);
    if (transactions.length === 0) {
        return res.status(200).json({
            customerId: customerId,
            transactions: []
        });
    }

    // Filter transactions
    transactions = transactions.filter(tx => {
        if (accountId && tx.accountId !== accountId) {
            return false;
        }
        if (transactionType && tx.type !== transactionType) {
            return false;
        }
        return true;
    });

    // Convert to response format
    const responseTransactions = transactions.map(tx => ({
        id: tx.id,
        accountId: tx.accountId,
        customerId: tx.customerId,
        type: tx.type,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId || '',
        toAccountId: tx.toAccountId || '',
        createdAt: tx.createdAt.toISOString()
    }));

    const response = {
        customerId: customerId,
        transactions: responseTransactions
    };
    console.log(`Fetched ${responseTransactions.length} transactions for customer ${customerId}`); // Debug log
    res.status(200).json(response);
});

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Starting javascript-banking server on :${PORT}...`);
});