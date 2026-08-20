// server.js
import express from 'express';

const app = express();

// ... vos middlewares et routes ...

// ============================================================
// DÉMARRAGE AUTOMATIQUE - VÉRIFICATION DES CONTRATS
// ============================================================





// ============================================================
// DÉMARRAGE DU SERVEUR
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
  console.log('📋 Les notifications seront vérifiées automatiquement');
});