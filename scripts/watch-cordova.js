const chokidar = require('chokidar');
const { exec } = require('child_process');
const path = require('path');

console.log('Starting Cordova file watcher...');

// Watch for changes in the www directory
const watcher = chokidar.watch('www/**/*', {
  ignored: /[\/\\]\./, // ignore dotfiles
  persistent: true
});

let isProcessing = false;

watcher.on('change', (filePath) => {
  if (isProcessing) {
    console.log(`Change detected in ${filePath}, but still processing previous change...`);
    return;
  }

  console.log(`File changed: ${filePath}`);
  
  isProcessing = true;
  
  // Determine which platform to prepare based on arguments
  const platform = process.argv[2] || 'browser';
  
  console.log(`Preparing Cordova ${platform} platform...`);
  
  exec(`cordova build ${platform}`, (error, stdout, stderr) => {
    isProcessing = false;
    
    if (error) {
      console.error(`Error preparing ${platform}: ${error}`);
      return;
    }
    
    console.log(`${platform} platform prepared successfully!`);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  });
});

watcher.on('add', (filePath) => {
  console.log(`File added: ${filePath}`);
});

watcher.on('unlink', (filePath) => {
  console.log(`File removed: ${filePath}`);
});

console.log('Watching for changes in www/ directory...');
console.log('Press Ctrl+C to stop');