; Triskell Lanceur — page personnalisee pour l'installateur NSIS
; Ajoute une page apres le Welcome qui propose a l'utilisateur de choisir
; s'il veut un raccourci sur le bureau (case a cocher, cochee par defaut).

!include nsDialogs.nsh
!include LogicLib.nsh

Var DesktopShortcutCheckbox
Var WantDesktopShortcut

; ==============================================================================
; Init : on coche par defaut "Creer un raccourci sur le bureau".
; ==============================================================================
!macro customInit
  StrCpy $WantDesktopShortcut 1
!macroend

; ==============================================================================
; Insere notre page custom JUSTE APRES la page d'accueil.
; (customWelcomePage remplace la page de bienvenue ; on remet la page MUI
;  d'accueil standard, puis on ajoute notre page personnalisee derriere.)
; ==============================================================================
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
  Page custom shortcutsPageCreate shortcutsPageLeave
!macroend

Function shortcutsPageCreate
  !insertmacro MUI_HEADER_TEXT "Personnaliser l'installation" "Choisis tes préférences pour Triskell Lanceur."

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0u 100% 28u "Le Lanceur sera installé sur ta machine. Tu peux aussi créer un raccourci pour le retrouver facilement :"

  ${NSD_CreateCheckbox} 10u 35u 90% 12u "Créer un raccourci sur le bureau (recommandé)"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox

  ${NSD_CreateLabel} 10u 55u 90% 24u "Un raccourci sera aussi créé dans le menu Démarrer dans tous les cas."

  nsDialogs::Show
FunctionEnd

Function shortcutsPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $WantDesktopShortcut
FunctionEnd

; ==============================================================================
; A l'installation : on cree le raccourci bureau si la case etait cochee.
; ==============================================================================
!macro customInstall
  ${If} $WantDesktopShortcut == 1
    CreateShortCut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${EndIf}
!macroend

; ==============================================================================
; A la desinstallation : on supprime aussi le raccourci bureau qu'on a cree.
; ==============================================================================
!macro customRemoveFiles
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
!macroend
