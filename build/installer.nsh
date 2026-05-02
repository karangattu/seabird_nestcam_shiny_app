!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install Seabird NestCam Annotation"
  !define MUI_WELCOMEPAGE_TEXT "This installer sets up the desktop app on this computer. Node.js, npm, and the source code are not needed after installation.$\r$\n$\r$\nWhen the app opens for the first time, it will ask for the Google Sheets and Synology NAS settings provided for your project.$\r$\n$\r$\nKeep this computer on the same network or VPN as the NAS when using a private NAS address."
  !insertmacro MUI_PAGE_WELCOME
!macroend
