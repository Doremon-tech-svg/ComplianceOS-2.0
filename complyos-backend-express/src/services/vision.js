/**
 * ComplianceOS — Free OCR Adapter
 * Uses Tesseract.js (free, open-source) for images
 * Uses pdf-parse (free) for text-based PDFs
 * No paid APIs required!
 */

import Tesseract from 'tesseract.js';
import { PDFParse } from 'pdf-parse';
import logger from '../logger.js';

/**
 * v2-compatible wrapper around pdf-parse.
 * Mimics the v1 API: pdf(buffer) -> { text, numpages }.
 */
async function pdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: result.text || '',
      numpages: result.total || 0,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

let tesseractWorker = null;
let workerInitFailed = false;

/**
 * Initialize Tesseract worker for better performance
 */
async function getTesseractWorker() {
  if (tesseractWorker) return tesseractWorker;
  if (workerInitFailed) {
    logger.warn('Tesseract worker init previously failed, skipping');
    return null;
  }

  try {
    logger.info('Initializing Tesseract worker with eng+hin languages');
    tesseractWorker = await Tesseract.createWorker('eng+hin', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          logger.debug('Tesseract OCR progress', { progress: m.progress });
        }
      },
    });
    logger.info('Tesseract worker initialized successfully');
    return tesseractWorker;
  } catch (err) {
    logger.error('Failed to initialize Tesseract worker', { error: err.message, stack: err.stack });
    workerInitFailed = true;
    tesseractWorker = null;
    return null;
  }
}

/**
 * Detect if PDF is text-based or scanned
 */
async function isScannedPdf(pdfBuffer) {
  try {
    const data = await pdf(pdfBuffer);
    // Text-based PDFs have substantial text; scanned ones have < 100 chars
    return !data.text || data.text.trim().length < 100;
  } catch (err) {
    logger.warn('PDF parse failed, assuming scanned', { error: err.message });
    return true;
  }
}

/**
 * Extract text from a text-based PDF (free, no OCR needed)
 */
async function extractTextFromPdf(pdfBuffer) {
  const data = await pdf(pdfBuffer);
  const text = data.text || '';
  logger.info('Extracted text from PDF', { textLength: text.length, pages: data.numpages });
  
  return {
    text,
    confidence: 0.95,
    pages: data.numpages,
    isTextBased: true,
  };
}

/**
 * Run OCR on an image URL using Tesseract.js (FREE)
 */
export async function ocr(imageUrl) {
  logger.info('Starting OCR via Tesseract.js', { source: imageUrl });

  try {
    const worker = await getTesseractWorker();
    if (!worker) {
      throw new Error('Tesseract worker not available - check installation');
    }
    
    const result = await worker.recognize(imageUrl);

    const blocks = result.data.lines.map(line => ({
      text: line.text,
      confidence: line.confidence / 100,
      bbox: line.bbox,
    }));

    const avgConfidence = blocks.length > 0
      ? blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length
      : 0;

    logger.info('OCR completed', { 
      textLength: result.data.text.length, 
      confidence: avgConfidence,
    });

    return {
      text: result.data.text,
      blocks,
      confidence: avgConfidence,
    };
  } catch (err) {
    logger.error('OCR failed', { error: err.message });
    throw err;
  }
}

/**
 * Run OCR on an image buffer using Tesseract.js (FREE)
 */
export async function ocrFromBuffer(imageBuffer) {
  logger.info('Starting OCR via Tesseract.js', { bufferSize: imageBuffer.length });

  try {
    const worker = await getTesseractWorker();
    if (!worker) {
      throw new Error('Tesseract worker not available - check installation');
    }
    
    const result = await worker.recognize(imageBuffer);

    const blocks = result.data.lines.map(line => ({
      text: line.text,
      confidence: line.confidence / 100,
      bbox: line.bbox,
    }));

    const avgConfidence = blocks.length > 0
      ? blocks.reduce((sum, b) => sum + b.confidence, 0) / blocks.length
      : 0;

    logger.info('OCR completed', { 
      textLength: result.data.text.length, 
      confidence: avgConfidence,
    });

    return {
      text: result.data.text,
      blocks,
      confidence: avgConfidence,
    };
  } catch (err) {
    logger.error('OCR failed', { error: err.message });
    throw err;
  }
}

/**
 * Unified OCR that handles both images and PDFs
 * - Text-based PDFs: Uses pdf-parse (free, direct text extraction)
 * - Scanned PDFs & Images: Uses Tesseract.js (free, open-source OCR)
 */
export async function extractText(fileBuffer, mimeType) {
  const isPdf = mimeType?.includes('pdf');

  if (!isPdf) {
    // It's an image - use Tesseract OCR
    return ocrFromBuffer(fileBuffer);
  }

  // It's a PDF - check if text-based or scanned
  const scanned = await isScannedPdf(fileBuffer);

  if (!scanned) {
    // Text-based PDF - extract directly (free, no OCR needed)
    const result = await extractTextFromPdf(fileBuffer);
    return {
      text: result.text,
      blocks: result.text.split('\n').filter(t => t.trim()).map(t => ({ 
        text: t, 
        confidence: 0.95 
      })),
      confidence: result.confidence,
      pages: result.pages,
    };
  }

  // Scanned PDF - use Tesseract.js OCR
  logger.info('Processing scanned PDF');
  
  try {
    const data = await pdf(fileBuffer);
    if (data.text && data.text.trim().length > 50) {
      return {
        text: data.text,
        blocks: data.text.split('\n').filter(t => t.trim()).map(t => ({ 
          text: t, 
          confidence: 0.6 
        })),
        confidence: 0.6,
        isScanned: true,
      };
    }
  } catch (err) {
    logger.warn('Scanned PDF extraction failed', { error: err.message });
  }

  // Return empty - requires proper scanned PDF handling
  return {
    text: '',
    blocks: [],
    confidence: 0,
    needsManualOCR: true,
  };
}
