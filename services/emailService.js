import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    // Configuration du transporteur (à adapter selon ton fournisseur email)
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false, // true pour 465, false pour les autres ports
      auth: {
        user: process.env.SMTP_USER, // Ton email
        pass: process.env.SMTP_PASS, // Ton mot de passe ou mot de passe d'application
      },
      tls: { 
        rejectUnauthorized: false
      }
    });
  }

  /**
   * Envoi d'email de réinitialisation de mot de passe
   */
  async sendPasswordResetEmail(email, code, userName = 'Utilisateur') {
    try {
      console.log('📧 Envoi email de réinitialisation à:', email);
      console.log('🔑 Code OTP:', code);

      const mailOptions = {
        from: `"Mi gban" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '🔐 Réinitialisation de votre mot de passe - Mi gban',
        html: this.getResetPasswordEmailTemplate(code, userName),
        text: this.getResetPasswordTextTemplate(code, userName)
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email envoyé avec succès:', info.messageId);
      return true;

    } catch (error) {
      console.error('❌ Erreur envoi email:', error);
      throw error;
    }
  }

  /**
   * Template HTML pour l'email
   */
  getResetPasswordEmailTemplate(code, userName) {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Réinitialisation mot de passe - Mi gban</title>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            background-color: #ff8800;
            padding: 20px;
            text-align: center;
          }
          .header h1 {
            color: white;
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 30px;
          }
          .code-container {
            background-color: #f8f9fa;
            border: 2px dashed #ff8800;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .code {
            font-size: 36px;
            font-weight: bold;
            color: #ff8800;
            letter-spacing: 5px;
            font-family: monospace;
          }
          .button {
            display: inline-block;
            background-color: #ff8800;
            color: white;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 6px;
            margin-top: 20px;
            font-weight: bold;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
          .warning {
            color: #dc3545;
            font-size: 12px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Mi gban</h1>
          </div>
          <div class="content">
            <h2>Bonjour ${userName},</h2>
            <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte Mi gban.</p>
            <p>Utilisez le code ci-dessous pour créer un nouveau mot de passe :</p>
            
            <div class="code-container">
              <div class="code">${code}</div>
            </div>
            
            <p>Ce code est valable pendant <strong>15 minutes</strong>.</p>
            
            <p style="text-align: center;">
              <a href="app://reset-password?code=${code}" class="button">Réinitialiser mon mot de passe</a>
            </p>
            
            <div class="warning">
              <p>⚠️ Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe restera inchangé.</p>
              <p>Pour des raisons de sécurité, ne partagez jamais ce code avec personne.</p>
            </div>
          </div>
          <div class="footer">
            <p>© 2026 Mi gban - Votre partenaire immobilier de confiance</p>
            <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Template texte simple pour l'email
   */
  getResetPasswordTextTemplate(code, userName) {
    return `
      Bonjour ${userName},
      
      Vous avez demandé la réinitialisation de votre mot de passe pour votre compte Mi gban.
      
      Votre code de réinitialisation est : ${code}
      
      Ce code est valable pendant 15 minutes.
      
      Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
      
      Pour des raisons de sécurité, ne partagez jamais ce code avec personne.
      
      ---
      Mi gban - Votre partenaire immobilier de confiance
    `;
  }
}

export default new EmailService();