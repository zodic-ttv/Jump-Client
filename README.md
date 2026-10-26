// settings-ui.js settings menu, i made it easy for you to add settings dw twin
// assets ->
//    this has all the assets used in the client (as in the icon for launch n stuff)

// u will need 

- Windows (tested on Windows 11)
- [Node.js](https://nodejs.org) (current LTS or newer) and [Git](https://git-scm.com)
  
// then

git clone https://github.com/zodic-ttv/Jump-Client.git
cd Jump-Client
npm install
npm start

// ^^^ run this stuff in powershell

// for uncapping fps turn on uncap fps then restart
// use: https://github.com/bigjakk/Electron-Websocket-Fix/releases. 
// Windows x64 - it should be 44.0.0
npm install --save-dev --save-exact electron@44.0.0

Remove-Item -Recurse -Force node_modules\electron\dist
New-Item -ItemType Directory node_modules\electron\dist
tar -xf "C:\path\to\the-patched-zip.zip" -C node_modules\electron\dist
