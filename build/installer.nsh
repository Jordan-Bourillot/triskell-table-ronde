; Triskell Lanceur — page personnalisee pour l'installateur NSIS
; Ajoute une page apres le Welcome qui propose a l'utilisateur de choisir
; s'il veut un raccourci sur le bureau (case a cocher, cochee par defaut).

!include nsDialogs.nsh
!include LogicLib.nsh

; Les deux variables n'existent que cote installateur (uninstaller ne les voit
; jamais ; sinon NSIS warning 6001 "variable not referenced").
!ifndef BUILD_UNINSTALLER
Var WantDesktopShortcut
Var DesktopShortcutCheckbox
!endif

; ==============================================================================
; Init : on coche par defaut "Creer un raccourci sur le bureau".
; ==============================================================================
!macro customInit
  StrCpy $WantDesktopShortcut 1
!macroend

; ==============================================================================
; Insere notre page custom APRES le choix du dossier d'installation
; et AVANT le bouton "Installer". Le hook 'customPageAfterChangeDir' est
; expose par electron-builder dans templates/nsis/assistedInstaller.nsh.
; ==============================================================================
!macro customPageAfterChangeDir
  Page custom shortcutsPageCreate shortcutsPageLeave
!macroend

; Les fonctions de page n'existent que pour l'installateur (pas pour l'uninstaller).
; Sans ce !ifndef BUILD_UNINSTALLER, NSIS warning 6010 "function not referenced"
; pendant la passe uninstaller fait planter le build (warning treated as error).
!ifndef BUILD_UNINSTALLER
Function shortcutsPageCreate
  ; Detection update : si l'executable est deja dans $INSTDIR, c'est une
  ; reinstall/update, pas une 1ere install. On ne re-pose pas la question
  ; et on respecte le raccourci tel qu'il etait. (Pas de ${isUpdated} ici
  ; car ca depend de StdUtils qui n'est pas garanti charge a ce stade.)
  ${If} ${FileExists} "$INSTDIR\${APP_FILENAME}.exe"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ; Titre de la page (en gras, plus grand)
  ${NSD_CreateLabel} 0 0u 100% 14u "Personnaliser l'installation"
  Pop $0
  CreateFont $1 "$(^Font)" "10" "700"
  SendMessage $0 ${WM_SETFONT} $1 0

  ${NSD_CreateLabel} 0 18u 100% 12u "Choisis tes préférences pour Triskell Lanceur."

  ${NSD_CreateLabel} 0 40u 100% 24u "Tu peux créer un raccourci pour retrouver le Lanceur facilement :"

  ${NSD_CreateCheckbox} 10u 70u 90% 12u "Créer un raccourci sur le bureau (recommandé)"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox

  ${NSD_CreateLabel} 10u 90u 90% 24u "Un raccourci dans le menu Démarrer sera créé automatiquement dans tous les cas."

  nsDialogs::Show
FunctionEnd

Function shortcutsPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $WantDesktopShortcut
FunctionEnd
!endif

; ==============================================================================
; A l'installation : on cree le raccourci bureau si la case etait cochee.
; Pour un update, on ne touche pas au raccourci (l'utilisateur a deja choisi
; lors de la 1ere installation, on respecte son choix).
; ==============================================================================
!macro customInstall
  ; Sur un update (raccourci bureau deja decide a la 1ere install),
  ; on ne touche pas a celui qui existe — on ne le recree que si la
  ; case etait cochee ET qu'aucun raccourci n'existe deja.
  ${If} $WantDesktopShortcut == 1
  ${AndIfNot} ${FileExists} "$DESKTOP\${PRODUCT_FILENAME}.lnk"
    CreateShortCut "$DESKTOP\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_FILENAME}.exe" "" "$INSTDIR\${APP_FILENAME}.exe" 0
  ${EndIf}
!macroend

; ==============================================================================
; A la desinstallation : on supprime aussi le raccourci bureau qu'on a cree.
; ==============================================================================
!macro customRemoveFiles
  Delete "$DESKTOP\${PRODUCT_FILENAME}.lnk"
!macroend
