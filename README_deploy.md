# Instrucciones de Despliegue Automático

He configurado un script de GitHub Actions que se encargará de actualizar el servidor automáticamente cada vez que hagas un `push` a la rama `main`.

Para que esto funcione, necesitas configurar unos *Secrets* en tu repositorio de GitHub.

### Pasos para configurar los Secrets en GitHub

1. Ve a tu repositorio en GitHub: https://github.com/jaestefaniah27/poker
2. Ve a la pestaña **Settings** (Configuración).
3. En el menú de la izquierda, despliega la sección **Secrets and variables** y haz clic en **Actions**.
4. Haz clic en el botón verde **New repository secret** para añadir cada uno de los siguientes tres secretos:

   *   **Name:** `SERVER_HOST`
       **Secret:** `143.47.37.92`

   *   **Name:** `SERVER_USER`
       **Secret:** `ubuntu`

   *   **Name:** `SERVER_SSH_KEY`
       **Secret:** (Aquí tienes que pegar el contenido **entero** de tu clave privada SSH. Es el contenido del archivo `C:\Users\jaest\.ssh\minecraft_server\minecraft-server-private-key-ssh`. Empieza por `-----BEGIN OPENSSH PRIVATE KEY-----` y termina por `-----END OPENSSH PRIVATE KEY-----`)

Una vez que hayas guardado estos 3 secretos, cualquier cambio que subas a la rama `main` disparará una acción que:
1. Entrará al servidor.
2. Hará un `git pull`.
3. Instalará dependencias de cliente y servidor.
4. Compilará ambos.
5. Reiniciará el servidor de Node (PM2) y actualizará los archivos estáticos de Nginx.
