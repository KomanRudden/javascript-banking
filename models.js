class Customer {
    constructor(id, name, email) {
        this.id = id;
        this.name = name;
        this.email = email;
    }
}

class Account {
    constructor(id, customerId, type, balance, createdAt) {
        this.id = id;
        this.customerId = customerId;
        this.type = type; // "current" or "savings"
        this.balance = balance;
        this.createdAt = createdAt;
    }
}

class Transaction {
    constructor(id, accountId, customerId, type, amount, fromAccountId = null, toAccountId = null, createdAt) {
        this.id = id;
        this.accountId = accountId;
        this.customerId = customerId;
        this.type = type; // "transfer", "payment", "bonus", "interest", "fee"
        this.amount = amount;
        this.fromAccountId = fromAccountId;
        this.toAccountId = toAccountId;
        this.createdAt = createdAt;
    }
}

module.exports = { Customer, Account, Transaction };