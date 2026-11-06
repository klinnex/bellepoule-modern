/**
 * BellePoule Modern - Écran d'arène : panneaux d'attente / présentation / match suivant,
 * extraits de arena.html (#1401). Le DOM est injecté. Servi en /js/arenaPanels.js (CSP 'self').
 * Licensed under GPL-3.0
 */
(function (root) {
  'use strict';

  /** Source d'image d'une photo base64 (avec ou sans préfixe data:) */
  function photoSrc(photo) {
    return photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
  }

  /** Affiche la photo ou, à défaut, l'icône par défaut */
  function setPhoto(doc, imgId, iconId, photo) {
    const img = doc.getElementById(imgId);
    const icon = doc.getElementById(iconId);
    if (photo) {
      img.src = photoSrc(photo);
      img.style.display = 'block';
      icon.style.display = 'none';
    } else {
      img.style.display = 'none';
      icon.style.display = 'block';
    }
  }

  const fullName = f => `${f.lastName || ''} ${f.firstName || ''}`.trim() || '-';

  /** Tireurs gauche/droite selon l'inversion (sans inversion, B à gauche) */
  function sides(match, inv) {
    const fA = match.fencerA || {};
    const fB = match.fencerB || {};
    return inv ? { left: fA, right: fB } : { left: fB, right: fA };
  }

  /**
   * Quels écrans afficher selon le statut du match.
   * action : 'idle' (attente, remise à zéro de la prolongation), 'intro' (photos),
   * 'nextPanel' (match suivant après la fin), 'idleDisplay' (aperçu du match suivant), null.
   */
  function visibilityPlan(matchStatus, showPhotos, hasCurrent, hasNext) {
    const waiting = { waiting: true, matchActive: false, intro: false, next: false };
    if (matchStatus === 'idle' || matchStatus === 'not_started') {
      return { ...waiting, action: 'idle' };
    }
    if (matchStatus === 'ready' && showPhotos && hasCurrent) {
      return { waiting: false, matchActive: false, intro: true, next: false, action: 'intro' };
    }
    if (matchStatus === 'in_progress') {
      return { waiting: false, matchActive: true, intro: false, next: false, action: null };
    }
    if (matchStatus === 'finished') {
      if (hasNext) {
        return { waiting: false, matchActive: true, intro: false, next: true, action: 'nextPanel' };
      }
      return { ...waiting, action: 'idleDisplay' };
    }
    return { ...waiting, action: 'idleDisplay' }; // 'ready' sans photos : combat pas encore démarré
  }

  /** Applique le plan aux quatre conteneurs */
  function applyVisibility(doc, plan) {
    const set = (id, cls, on) => {
      const el = doc.getElementById(id);
      if (el) el.classList.toggle(cls, on);
    };
    set('waiting-screen', 'hidden', !plan.waiting);
    set('match-display', 'active', plan.matchActive);
    set('photo-intro', 'hidden', !plan.intro);
    set('next-match-panel', 'hidden', !plan.next);
  }

  function updatePhotoIntro(doc, match, inv) {
    if (!match) return;
    const { left, right } = sides(match, inv);
    doc.getElementById('intro-name-a').textContent = fullName(left);
    doc.getElementById('intro-club-a').textContent = left.club || '';
    doc.getElementById('intro-name-b').textContent = fullName(right);
    doc.getElementById('intro-club-b').textContent = right.club || '';
    setPhoto(doc, 'photo-a', 'default-icon-a', left.photo);
    setPhoto(doc, 'photo-b', 'default-icon-b', right.photo);
  }

  function updateNextMatchPanel(doc, next, inv, refereeFeatureEnabled) {
    if (!next) return;
    const { left, right } = sides(next, inv);
    doc.getElementById('next-name-a').textContent = fullName(left);
    doc.getElementById('next-name-b').textContent = fullName(right);
    setPhoto(doc, 'next-photo-a', 'next-icon-a', left.photo);
    setPhoto(doc, 'next-photo-b', 'next-icon-b', right.photo);

    const refEl = doc.getElementById('next-referee-name');
    const refLabel = doc.getElementById('next-referee-label');
    const idleBanner = doc.getElementById('idle-referee-banner');
    const idleLabel = doc.getElementById('idle-referee-label');
    if (refereeFeatureEnabled && next.referee) {
      const refName = next.referee.name;
      if (refEl && refLabel) {
        refLabel.textContent = refName;
        refEl.classList.remove('hidden');
      }
      if (idleBanner && idleLabel) {
        idleLabel.textContent = refName;
        idleBanner.classList.remove('hidden');
      }
    } else {
      if (refEl) refEl.classList.add('hidden');
      if (idleBanner) idleBanner.classList.add('hidden');
    }
  }

  /** Aperçu du match suivant sur l'écran d'attente (remplace le numéro d'arène) */
  function updateIdleNextMatchDisplay(doc, next, inv) {
    const preview = doc.getElementById('next-idle-preview');
    const idleNumber = doc.getElementById('arena-idle-number');
    const idleLabel = doc.querySelector('.arena-idle-label');
    if (next) {
      const { left, right } = sides(next, inv);
      doc.getElementById('idle-name-a').textContent = fullName(left);
      doc.getElementById('idle-club-a').textContent = left.club || '';
      doc.getElementById('idle-name-b').textContent = fullName(right);
      doc.getElementById('idle-club-b').textContent = right.club || '';
      setPhoto(doc, 'idle-photo-a', 'idle-icon-a', left.photo);
      setPhoto(doc, 'idle-photo-b', 'idle-icon-b', right.photo);
      preview.classList.remove('hidden');
      idleNumber.style.display = 'none';
      if (idleLabel) idleLabel.style.display = 'none';
    } else {
      preview.classList.add('hidden');
      idleNumber.style.display = '';
      if (idleLabel) idleLabel.style.display = '';
    }
  }

  const api = {
    photoSrc,
    setPhoto,
    visibilityPlan,
    applyVisibility,
    updatePhotoIntro,
    updateNextMatchPanel,
    updateIdleNextMatchDisplay,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.BPArenaPanels = api;
})(typeof window !== 'undefined' ? window : undefined);
