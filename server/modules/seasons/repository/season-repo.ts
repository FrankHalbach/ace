import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { season, type SeasonId, type SeasonInsert, type SeasonRow, type SeasonStatus } from '../../../db/schema/season'

export const seasonRepo = {
  list(): SeasonRow[] {
    return useDb().select().from(season).orderBy(season.createdAt).all()
  },

  findById(id: SeasonId): SeasonRow | undefined {
    return useDb().select().from(season).where(eq(season.id, id)).get()
  },

  findByName(name: string): SeasonRow | undefined {
    return useDb().select().from(season).where(eq(season.name, name)).get()
  },

  /**
   * Erste Saison mit dem gegebenen Status, geordnet nach `createdAt` —
   * praktisch ein „get active": es soll im Regelbetrieb genau eine ACTIVE
   * Saison geben, aber wir wählen deterministisch die älteste, falls es
   * (versehentlich) mehrere gibt.
   */
  findFirstByStatus(status: SeasonStatus): SeasonRow | undefined {
    return useDb()
      .select()
      .from(season)
      .where(eq(season.status, status))
      .orderBy(season.createdAt)
      .get()
  },

  insert(values: SeasonInsert): SeasonRow {
    const rows = useDb().insert(season).values(values).returning().all()
    return rows[0]!
  },

  /** Atomic patch — wirft, wenn 0 oder mehr als 1 Zeilen betroffen wären. */
  updateById(id: SeasonId, patch: Partial<SeasonInsert>): SeasonRow | undefined {
    const rows = useDb()
      .update(season)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(season.id, id))
      .returning()
      .all()
    return rows[0]
  },

  /**
   * Race-safe Status-Transition: nur erfolgreich, wenn der aktuelle Status
   * dem erwarteten entspricht. Liefert die aktualisierte Zeile oder
   * undefined, wenn die Vorbedingung nicht traf.
   */
  transitionStatus(
    id: SeasonId,
    fromStatus: SeasonStatus,
    patch: Partial<SeasonInsert>,
  ): SeasonRow | undefined {
    const rows = useDb()
      .update(season)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(season.id, id), eq(season.status, fromStatus)))
      .returning()
      .all()
    return rows[0]
  },

  deleteById(id: SeasonId): number {
    const r = useDb().delete(season).where(eq(season.id, id)).run()
    return r.changes
  },
}
