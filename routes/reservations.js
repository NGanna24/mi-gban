import express from 'express';
import ReservationController from '../controllers/ReservationController.js';

const router = express.Router();

// ✅ CORRECTION : Supprimer le préfixe "/reservations" en double
router.post('/', ReservationController.create); // Maintenant : POST /api/reservations
router.get('/user/:id_utilisateur', ReservationController.getReservationsByUser);
router.get('/owner/:id_proprietaire', ReservationController.getReservationsByOwner);
router.get('/property/:id_propriete', ReservationController.getReservationsByProperty);
router.get('/:id_reservation', ReservationController.getReservationById);
router.get('/slots/:id_propriete/:date_visite', ReservationController.getAvailableSlots);
router.put('/:id_reservation/status', ReservationController.updateStatus);
router.put('/:id_reservation/notes', ReservationController.updateNotes);
router.put('/:id_reservation/cancel', ReservationController.cancel);
router.post('/check-availability', ReservationController.checkAvailability);
router.get('/check-booking/:id_utilisateur/:id_propriete', ReservationController.hasUserBookedProperty);
router.get('/stats', ReservationController.getStats);

export default router;