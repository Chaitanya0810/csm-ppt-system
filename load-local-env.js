// Hosting environment variables take precedence over the optional local file.
try {
  process.loadEnvFile(require('node:path').join(__dirname, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
