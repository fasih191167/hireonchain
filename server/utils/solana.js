const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');

// Get Solana connection based on network configuration
const getSolanaConnection = () => {
  const network = process.env.SOLANA_NETWORK || 'devnet';
  return new Connection(clusterApiUrl(network), 'confirmed');
};

// Validate a Solana wallet address
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const isValidSolanaAddress = address => {
  if (!address || !SOLANA_ADDRESS_REGEX.test(address)) return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

const isValidTransactionSignature = signature => {
  // Base58 string; signatures are usually 87-88 chars, but keep this permissive.
  return typeof signature === 'string' && signature.length >= 32 && signature.length <= 200;
};

// Get account information
const getAccountInfo = async address => {
  try {
    const connection = getSolanaConnection();
    const pubkey = new PublicKey(address);
    const accountInfo = await connection.getAccountInfo(pubkey);
    return accountInfo;
  } catch (error) {
    console.error('Error getting account info:', error);
    return null;
  }
};

// Get account balance
const getBalance = async address => {
  try {
    const connection = getSolanaConnection();
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);
    return balance / 1000000000; // Convert lamports to SOL
  } catch (error) {
    console.error('Error getting balance:', error);
    return 0;
  }
};

// Verify transaction exists and was successful
const verifyTransaction = async signature => {
  try {
    const connection = getSolanaConnection();
    const transaction = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      return { valid: false, error: 'Transaction not found' };
    }

    if (transaction.meta?.err) {
      return { valid: false, error: 'Transaction failed on-chain', details: transaction.meta.err };
    }

    return { valid: true, transaction };
  } catch (error) {
    console.error('Error verifying transaction:', error);
    return { valid: false, error: error.message };
  }
};

const verifyProgramTransaction = async (signature, expectedProgramId) => {
  const result = await verifyTransaction(signature);

  if (!result.valid) {
    return result;
  }

  const { transaction } = result;

  const programId = expectedProgramId || process.env.SOLANA_PROGRAM_ID;
  if (!programId) {
    return { valid: false, error: 'SOLANA_PROGRAM_ID not configured in environment variables' };
  }

  const involvesProgram = transaction.transaction.message.accountKeys.some(
    key => key.toString() === programId
  );

  if (!involvesProgram) {
    return { valid: false, error: 'Transaction does not involve our program' };
  }

  return { valid: true, transaction };
};

const verifyTxInvolvesWallet = async (signature, expectedWalletAddress) => {
  try {
    if (!isValidTransactionSignature(signature)) {
      return { valid: false, error: 'Invalid transaction signature format' };
    }
    if (!isValidSolanaAddress(expectedWalletAddress)) {
      return { valid: false, error: 'Invalid expected wallet address format' };
    }

    const connection = getSolanaConnection();
    const parsed = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!parsed) {
      return { valid: false, error: 'Transaction not found' };
    }

    if (parsed.meta?.err) {
      return { valid: false, error: 'Transaction failed on-chain', details: parsed.meta.err, transaction: parsed };
    }

    const expected = new PublicKey(expectedWalletAddress).toBase58();
    const accountKeys = parsed.transaction.message.accountKeys || [];
    const involved = accountKeys.some(k => {
      const pubkey = (k && typeof k === 'object' && 'pubkey' in k) ? k.pubkey : k;
      return pubkey && pubkey.toString() === expected;
    });

    if (!involved) {
      return { valid: false, error: 'Expected wallet address not involved in transaction', transaction: parsed };
    }

    return { valid: true, transaction: parsed };
  } catch (error) {
    console.error('Error verifying transaction wallet involvement:', error);
    return { valid: false, error: error.message };
  }
};

module.exports = {
  getSolanaConnection,
  isValidSolanaAddress,
  isValidTransactionSignature,
  getAccountInfo,
  getBalance,
  verifyTransaction,
  verifyProgramTransaction,
  verifyTxInvolvesWallet,
};
