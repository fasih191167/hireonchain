const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyTxInvolvesWallet, isValidTransactionSignature } = require('../utils/solana');

const router = express.Router();

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { verified: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
});

router.post('/verify-tx', verifyLimiter, async (req, res) => {
  try {
    const signature = req.body?.signature;
    if (!isValidTransactionSignature(signature)) {
      return res.status(400).json({
        verified: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Provide a valid Solana transaction signature as { "signature": "..." }.' },
      });
    }

    const expectedWallet = process.env.SOLANA_EXPECTED_WALLET;
    if (!expectedWallet) {
      return res.status(500).json({
        verified: false,
        error: { code: 'SERVER_MISCONFIGURED', message: 'SOLANA_EXPECTED_WALLET is not configured.' },
      });
    }

    const result = await verifyTxInvolvesWallet(signature, expectedWallet);
    const cluster = process.env.SOLANA_NETWORK || 'devnet';

    if (!result.valid) {
      const notFound = result.error === 'Transaction not found';
      return res.status(notFound ? 404 : 400).json({
        verified: false,
        signature,
        cluster,
        expectedWallet,
        checks: {
          exists: !notFound,
          successful: false,
          expectedWalletInvolved: false,
        },
        error: {
          code: notFound ? 'TX_NOT_FOUND' : 'TX_VERIFICATION_FAILED',
          message: result.error,
          details: result.details,
        },
      });
    }

    const tx = result.transaction;
    return res.json({
      verified: true,
      signature,
      cluster,
      expectedWallet,
      checks: {
        exists: true,
        successful: true,
        expectedWalletInvolved: true,
      },
      transaction: {
        slot: tx.slot,
        blockTime: tx.blockTime,
        confirmationStatus: tx.meta?.confirmationStatus,
        feeLamports: tx.meta?.fee,
      },
    });
  } catch (error) {
    console.error('verify-tx endpoint error:', error);
    return res.status(500).json({
      verified: false,
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' },
    });
  }
});

module.exports = router;

