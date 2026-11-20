/**
 * BellePoule Modern - Competition Service
 * Feature-specific service for competition operations
 * Licensed under GPL-3.0
 */

import { Competition } from '../../../shared/types';
import { CreateCompetitionDTO, UpdateCompetitionDTO } from '../types/competition.types';

export class CompetitionService {
  async getAll(): Promise<Competition[]> {
    if (!window.electronAPI?.db) {
      throw new Error('Database not available');
    }
    return await window.electronAPI.db.getAllCompetitions();
  }

  async getById(id: string): Promise<Competition | null> {
    if (!window.electronAPI?.db) {
      throw new Error('Database not available');
    }
    return await window.electronAPI.db.getCompetition(id);
  }

  async create(data: CreateCompetitionDTO): Promise<Competition> {
    if (!window.electronAPI?.db) {
      throw new Error('Database not available');
    }
    const competitionData = {
      title: data.title,
      date: data.date,
      location: data.location,
      organizer: data.organizer,
      weapon: data.weapon,
      gender: data.gender,
      category: data.category,
      settings: data.settings || {},
    };
    return await window.electronAPI.db.createCompetition(competitionData);
  }

  async update(id: string, data: UpdateCompetitionDTO): Promise<Partial<Competition>> {
    if (!window.electronAPI?.db) {
      throw new Error('Database not available');
    }
    await window.electronAPI.db.updateCompetition(id, data);
    // Les libellés d'arme du DTO (chaînes) sont ceux de l'enregistrement en base
    return data as Partial<Competition>;
  }

  async delete(id: string): Promise<void> {
    if (!window.electronAPI?.db) {
      throw new Error('Database not available');
    }
    await window.electronAPI.db.deleteCompetition(id);
  }
}
