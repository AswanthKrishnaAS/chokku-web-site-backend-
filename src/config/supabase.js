const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || 'https://gxavrslwnffdhhewyzil.supabase.co';
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

// Initialize Supabase client if key exists
const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
if (supabase) {
  console.log('✅ Supabase client initialized with URL:', supabaseUrl);
} else {
  console.warn('⚠️ Supabase client key missing in environment variables.');
}


/**
 * Ensure specified storage bucket exists or attempt to create it
 * @param {string} bucketName 
 * @returns {Promise<string>} Active bucket name
 */
const ensureBucketExists = async (bucketName) => {
  if (!supabase) return bucketName;
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (!listError && buckets) {
      const existing = buckets.find((b) => b.name === bucketName || b.id === bucketName);
      if (existing) {
        return existing.name;
      }
    }

    // Attempt to create public bucket if it doesn't exist
    const { data: newBucket, error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'],
    });

    if (!createError && newBucket) {
      console.log(`✅ Auto-created public Supabase storage bucket: "${bucketName}"`);
      return bucketName;
    } else if (createError) {
      console.warn(`Note on bucket "${bucketName}":`, createError.message);
      if (buckets && buckets.length > 0) {
        console.log(`Using existing bucket "${buckets[0].name}" instead.`);
        return buckets[0].name;
      }
    }
  } catch (err) {
    console.warn('Bucket verification warning:', err.message);
  }
  return bucketName;
};

/**
 * Upload file buffer or file path to Supabase Storage bucket or local fallback
 * @param {Object} file - Multer file object
 * @param {string} targetBucket - Bucket name (default 'website-assets')
 * @returns {Promise<string>} Public URL of the uploaded image
 */
const uploadToBucketOrLocal = async (file, targetBucket = 'website-assets') => {
  let bucket = process.env.SUPABASE_BUCKET || targetBucket || 'website-assets';
  const fileExt = path.extname(file.originalname) || '.png';
  const fileName = `navbar-logo-${Date.now()}${fileExt}`;

  // If Supabase key is present, attempt upload to Supabase Storage bucket
  if (supabase) {
    try {
      bucket = await ensureBucketExists(bucket);

      const fileBuffer = file.buffer || fs.readFileSync(file.path);
      let { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, fileBuffer, {
          contentType: file.mimetype || 'image/png',
          upsert: true,
        });

      // If bucket was not found, attempt explicit creation and retry upload once
      if (error && (error.code === 'NoSuchBucket' || error.message?.includes('not found'))) {
        console.warn(`Bucket "${bucket}" not found on Supabase. Attempting public bucket creation...`);
        const { error: createErr } = await supabase.storage.createBucket(bucket, { public: true });
        if (!createErr) {
          const retry = await supabase.storage.from(bucket).upload(fileName, fileBuffer, {
            contentType: file.mimetype || 'image/png',
            upsert: true,
          });
          data = retry.data;
          error = retry.error;
        } else {
          console.error(`⚠️ Could not auto-create bucket "${bucket}". Please create bucket "${bucket}" in Supabase Dashboard (Storage -> Buckets -> Create Bucket) or provide SUPABASE_SECRET_KEY in backend/.env.`);
        }
      }

      if (!error && data) {
        const { data: publicData } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);

        if (publicData?.publicUrl) {
          console.log(`🚀 Uploaded logo to Supabase Storage bucket "${bucket}":`, publicData.publicUrl);
          return publicData.publicUrl;
        }
      }

      if (error) {
        console.warn('Supabase storage upload error:', error.message || error);
      }
    } catch (err) {
      console.error('Failed to upload to Supabase Storage, using local fallback:', err.message);
    }
  }

  // Local fallback storage directory
  const uploadsDir = path.join(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const localFilePath = path.join(uploadsDir, fileName);
  if (file.buffer) {
    fs.writeFileSync(localFilePath, file.buffer);
  } else if (file.path) {
    fs.copyFileSync(file.path, localFilePath);
  }

  // Return public URL relative to server static /uploads
  const port = process.env.PORT || 5000;
  return `http://localhost:${port}/uploads/${fileName}`;
};


module.exports = {
  supabase,
  uploadToBucketOrLocal,
};
