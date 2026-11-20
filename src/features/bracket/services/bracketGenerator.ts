/**
 * BellePoule Modern - Bracket Generator
 * Generates elimination bracket structures
 * Licensed under GPL-3.0
 */

import { Fencer, TableNode } from '../../../shared/types';

export interface BracketGeneratorConfig {
  fencers: Fencer[];
  seededFencers?: Fencer[];
  randomize?: boolean;
  tableSize: number;
}

export class BracketGenerator {
  /**
   * Generate a complete bracket structure
   */
  static generate(config: BracketGeneratorConfig): TableNode[] {
    const nodes: TableNode[] = [];
    const totalRounds = Math.log2(config.tableSize);

    // Generate all rounds
    for (let round = totalRounds; round >= 1; round--) {
      const matchesInRound = Math.pow(2, round - 1);

      for (let position = 1; position <= matchesInRound; position++) {
        const node: TableNode = {
          id: `node-${round}-${position}`,
          round,
          position,
          isBye: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Set up parent relationships (except for final)
        if (round < totalRounds) {
          const parentRound = round + 1;
          const parentPosition = Math.ceil(position / 2);

          if (position % 2 === 1) {
            node.parentA = `node-${parentRound}-${parentPosition}`;
          } else {
            node.parentB = `node-${parentRound}-${parentPosition}`;
          }
        }

        nodes.push(node);
      }
    }

    return nodes;
  }

  /**
   * Generate bye matches for incomplete brackets
   */
  static generateByes(fencerCount: number, tableSize: number): number[] {
    const byeCount = tableSize - fencerCount;
    const byes: number[] = [];

    // Distribute byes evenly
    for (let i = 0; i < byeCount; i++) {
      byes.push(Math.floor((i * tableSize) / byeCount));
    }

    return byes;
  }
}
