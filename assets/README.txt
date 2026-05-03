Place these files here :

1. logo_triskell.png  (depuis C:\Users\jorda\Downloads\Structure\logo_triskell.png)
2. triskell_mark.png  (optionnel, depuis le meme dossier)

Commande PowerShell pour le faire :

  Copy-Item "C:\Users\jorda\Downloads\Structure\logo_triskell.png" `
            "C:\Users\jorda\Downloads\Structure\Triskell_Lanceur\assets\logo_triskell.png"

L'app fonctionne meme sans le logo (un fallback texte est affiche).
