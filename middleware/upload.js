const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// Shared disk storage for CV / cover-letter uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const candidateName = (req.body.candidat_nom || 'candidat').replace(/[^a-zA-Z0-9]/gi, '_');
    const prefix = file.fieldname === 'cv' ? 'CV' : 'Cover';
    cb(null, `${prefix}_${candidateName}_${Date.now()}${path.extname(file.originalname)}`);
  },
});

// Only allow PDF / DOC / DOCX
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx']);

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.has(file.mimetype) && ALLOWED_EXT.has(ext)) {
    return cb(null, true);
  }
  cb(new Error('INVALID_FILE_TYPE'));
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter,
});

// Express error handler for multer/file-filter errors → clean 400 instead of 500
function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large (max 10 MB)'
      : `Upload error: ${err.message}`;
    return res.status(400).json({ success: false, error: msg });
  }
  if (err && err.message === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ success: false, error: 'Only PDF, DOC and DOCX files are allowed' });
  }
  next(err);
}

module.exports = { storage, upload, fileFilter, handleUploadError };
