class Store {
    constructor() {
        this.customers = new Map();
        this.accounts = new Map();
        this.transactions = new Map();
    }

    addCustomer(customer) {
        this.customers.set(customer.id, customer);
    }

    getCustomerById(customerId) {
        return this.customers.get(customerId);
    }

    addAccount(account) {
        this.accounts.set(account.id, account);
    }

    getAccountById(accountId) {
        return this.accounts.get(accountId);
    }

    updateAccount(account) {
        this.accounts.set(account.id, account);
    }

    getAccountsByCustomerId(customerId) {
        const accounts = [];
        for (const account of this.accounts.values()) {
            if (account.customerId === customerId) {
                accounts.push(account);
            }
        }
        return accounts;
    }

    addTransaction(transaction) {
        this.transactions.set(transaction.id, transaction);
    }

    getTransactionsByCustomerId(customerId) {
        // Get all account IDs for the customer
        const accountIds = new Set();
        for (const account of this.accounts.values()) {
            if (account.customerId === customerId) {
                accountIds.add(account.id);
            }
        }
        // Return transactions for those accounts
        const transactions = [];
        for (const transaction of this.transactions.values()) {
            if (accountIds.has(transaction.accountId)) {
                transactions.push(transaction);
            }
        }
        return transactions;
    }
}

module.exports = new Store();