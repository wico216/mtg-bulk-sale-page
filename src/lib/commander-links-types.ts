export interface CommanderLink {
  id: number;
  name: string;
  edhrecUrl: string;
  imageUrl: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommanderSearchResult {
  name: string;
  scryfallId: string | null;
  edhrecUrl: string;
  imageUrl: string | null;
  typeLine: string | null;
  colorIdentity: string[];
}
