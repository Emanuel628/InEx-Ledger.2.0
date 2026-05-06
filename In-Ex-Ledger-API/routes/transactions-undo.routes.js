const express = require('express');
const { pool } = require('../db.js');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { resolveBusinessIdForUser } = require('../api/utils/resolveBusinessIdForUser.js');
const { decrypt } = require('../services/encryptionService.js');
const { restoreMostRecentArchivedTransaction } = require('../services/transactionAuditService.js');
const { logError, logWarn } = require('../utils/logger.js');

const router = express.Router();

router.use(requireAuth);
router.use(requireCsrfProtection);

function tryDecrypt(value) {
  try {
    return decrypt(value);
  } catch (err) {
    logWarn('transaction restore description decryption failed, returning raw value:', err.message);
    return value;
  }
}

function decryptTransactionRow(row) {
  if (!row) return row;
  const { description_encrypted, ...rest } = row;
  return {
    ...rest,
    description: description_encrypted ? tryDecrypt(description_encrypted) : row.description
  };
}

router.post('/undo-delete', async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const restored = await restoreMostRecentArchivedTransaction({
      pool,
      businessId,
      userId: req.user.id
    });

    if (!restored) {
      return res.status(404).json({ error: 'No deleted transaction to restore.' });
    }

    res.json({
      message: 'Transaction restored.',
      transaction: decryptTransactionRow(restored)
    });
  } catch (err) {
    logError('POST /transactions/undo-delete error:', err);
    res.status(500).json({ error: 'Failed to restore transaction.' });
  }
});

module.exports = router;
