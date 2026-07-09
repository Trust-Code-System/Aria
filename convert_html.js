const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'stitch-screens');
const destDir = path.join(__dirname, 'app', '(dashboard)');

const files = [
  { file: 'Login.html', dest: '../login/page.tsx', name: 'LoginPage' },
  { file: 'Chat.html', dest: 'chat/page.tsx', name: 'ChatPage' },
];

function convertHtmlToJsx(html) {
  let jsx = html;
  
  // Replace class= with className=
  jsx = jsx.replace(/class=/g, 'className=');
  
  // Replace for= with htmlFor=
  jsx = jsx.replace(/for=/g, 'htmlFor=');

  // Replace style="..." with style={{...}}
  // Specifically we only care about: font-variation-settings: 'FILL' 1; and width: xx%
  jsx = jsx.replace(/style="font-variation-settings:\s*'FILL'\s*1;?"/g, 'style={{ fontVariationSettings: "\\\'FILL\\\' 1" }}');
  jsx = jsx.replace(/style="width:\s*([^"]+?);?"/g, 'style={{ width: "$1" }}');
  jsx = jsx.replace(/style="background-image:\s*url\\\('([^']+)'\\\);?"/g, 'style={{ backgroundImage: "url(\'$1\')" }}');

  // Self closing tags
  jsx = jsx.replace(/<input([^>]*?[^\/])>/g, '<input$1 />');
  jsx = jsx.replace(/<img([^>]*?[^\/])>/g, '<img$1 />');
  jsx = jsx.replace(/<br>/g, '<br />');
  jsx = jsx.replace(/<hr([^>]*?)>/g, '<hr$1 />');

  // Comments
  jsx = jsx.replace(/<!--([\s\S]*?)-->/g, '{/* $1 */}');

  return jsx;
}

for (const item of files) {
  const htmlPath = path.join(srcDir, item.file);
  if (!fs.existsSync(htmlPath)) continue;
  
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  // Extract main
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!mainMatch) {
    console.log(`Could not find main tag in ${item.file}`);
    continue;
  }
  
  let inner = mainMatch[1];
  
  // Remove ambient glow because it's in layout
  inner = inner.replace(/<div class(?:Name)?="absolute top-0 left-1\/4[^>]*><\/div>/, '');
  inner = inner.replace(/<div className="absolute top-0 left-1\/4[^>]*><\/div>/, '');
  inner = inner.replace(/<div className="absolute top-0 left-1\/4 w-96 h-96 bg-primary opacity-5 blur-\[120px\] rounded-full pointer-events-none"><\/div>/, '');
  
  inner = convertHtmlToJsx(inner);

  const destPath = path.join(destDir, item.dest);
  const destDirPath = path.dirname(destPath);
  if (!fs.existsSync(destDirPath)) {
    fs.mkdirSync(destDirPath, { recursive: true });
  }

  const component = `import React from 'react';
import { TopBar } from '@/components/TopBar';

export default function ${item.name}() {
  return (
    <>
      ${inner}
    </>
  );
}
`;

  fs.writeFileSync(destPath, component);
  console.log(`Created ${item.dest}`);
}
