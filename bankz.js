class Token {
    constructor(accessToken, expiresAt) {
        this.accessToken = accessToken;
        this.expiresAt = expiresAt;
    }
}

class MockClient {
    constructor() {
        this.accounts = {
            'bankz-acc-123': { accountId: 'bankz-acc-123', balance: 1000.0 },
            'bankz-acc-456': { accountId: 'bankz-acc-456', balance: 500.0 },
        };
        this.clientId = 'mock-client-id';
        this.clientSecret = 'mock-client-secret';
        this.token = null;
        this.tokenEndpoint = 'https://mock.bankz.com/oauth/token';
    }

    getToken() {
        // Check if token exists and is valid
        if (this.token && this.token.expiresAt > new Date()) {
            console.log(`Using cached Bank Z token: ${this.token.accessToken}`); // Debug log
            return this.token.accessToken;
        }

        // Simulate token request
        if (this.clientId !== 'mock-client-id' || this.clientSecret !== 'mock-client-secret') {
            throw new Error('Invalid client credentials');
        }

        // Generate a new mock token
        const tokenId = `token-${Date.now()}`;
        this.token = new Token(
            tokenId,
            new Date(Date.now() + 3600 * 1000) // Token valid for 1 hour
        );
        console.log(`Generated new Bank Z token: ${tokenId}`); // Debug log
        return this.token.accessToken;
    }

    validateToken(token) {
        if (!this.token || this.token.accessToken !== token || this.token.expiresAt <= new Date()) {
            throw new Error('Invalid or expired token');
        }
    }

    getBalance(accountId, token) {
        this.validateToken(token);
        const account = this.accounts[accountId];
        if (!account) {
            throw new Error(`Bank Z account ${accountId} not found`);
        }
        return account.balance;
    }

    initiateTransfer(fromAccountId, toAccountId, token, amount) {
        this.validateToken(token);
        if (amount <= 0) {
            throw new Error('Amount must be positive');
        }
        // Only validate toAccountId as a Bank Z account
        const toAccount = this.accounts[toAccountId];
        if (!toAccount) {
            throw new Error(`Destination Bank Z account ${toAccountId} not found`);
        }
        // Simulate updating Bank Z account balance
        toAccount.balance += amount;
        const transactionId = `bankz-tx-${Date.now()}`;
        console.log(`Bank Z transfer: from ${fromAccountId} to ${toAccountId}, amount ${amount}, txID ${transactionId}`); // Debug log
        return transactionId;
    }
}

module.exports = MockClient;