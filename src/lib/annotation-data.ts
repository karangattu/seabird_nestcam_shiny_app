export const CAMERAS = [
  "LOC001",
  "LOC002",
  "LOC003",
  "LOC004",
  "LOC005",
  "LOC006",
  "LOC007",
  "LOC008",
] as const;

export const SITE_LOCATIONS = [
  "Location 1",
  "Location 2",
  "Location 3",
  "Location 4",
  "Location 5",
  "Location 6",
] as const;

export const SEABIRD_SPECIES = [
  "Laysan Albatross (Phoebastria immutabilis)",
  "Black-footed Albatross (Phoebastria nigripes)",
  "Wedge-tailed Shearwater (Ardenna pacifica)",
  "Newell's Shearwater (Puffinus newelli)",
  "Hawaiian Petrel (Pterodroma sandwichensis)",
  "Red-tailed Tropicbird (Phaethon rubricauda)",
  "White-tailed Tropicbird (Phaethon lepturus)",
  "Brown Booby (Sula leucogaster)",
  "Red-footed Booby (Sula sula)",
  "Great Frigatebird (Fregata minor)",
  "Sooty Tern (Onychoprion fuscatus)",
  "Kolea (Pluvialis fulva)",
  "Unidentified Pewee (Contopus sp.)",
] as const;

export const PREDATOR_SPECIES = [
  "Rat (Rattus sp.)",
  "Cat (Felis catus)",
  "Mongoose (Herpestes javanicus)",
  "Barn Owl (Tyto alba)",
  "Dog (Canis lupus familiaris)",
  "Goat (Capra hircus)",
  "Deer (Cervidae)",
  "Black-crowned Night-Heron (Nycticorax night-heron)",
  "Cattle Egret (Bubulcus ibis)",
] as const;

export const SEABIRD_BEHAVIORS = [
  "Chick rearing",
  "Cleaning",
  "Courtship",
  "Defending territory",
  "Feeding",
  "Flying",
  "Foraging",
  "Incubating",
  "Nesting",
  "Preening",
  "Resting",
] as const;

export const PREDATOR_BEHAVIORS = [
  "Predation",
  "Scavenging",
  "Passing through",
  "Hunting",
  "Resting",
  "Foraging",
] as const;

export const ANNOTATION_COLUMNS = [
  "Start Filename",
  "End Filename",
  "Site",
  "Camera",
  "Retrieval Date",
  "Type",
  "Species",
  "Behavior",
  "Sequence Start Time",
  "Sequence End Time",
  "Is Single Image",
  "Reviewer Name",
  "Notes",
] as const;

export type AnnotationColumn = (typeof ANNOTATION_COLUMNS)[number];
export type ObservationType = "Seabird" | "Predator";
export type AnnotationRecord = Record<AnnotationColumn, string>;

export type AnnotationTemplate = {
  id?: string;
  label: string;
  type: ObservationType;
  species: string;
  behavior: string;
};

export const ANNOTATION_TEMPLATES: AnnotationTemplate[] = [
  {
    label: "Newell's Shearwater - Nesting",
    type: "Seabird",
    species: "Newell's Shearwater (Puffinus newelli)",
    behavior: "Nesting",
  },
  {
    label: "Newell's Shearwater - Flying",
    type: "Seabird",
    species: "Newell's Shearwater (Puffinus newelli)",
    behavior: "Flying",
  },
  {
    label: "Hawaiian Petrel - Nesting",
    type: "Seabird",
    species: "Hawaiian Petrel (Pterodroma sandwichensis)",
    behavior: "Nesting",
  },
  {
    label: "Hawaiian Petrel - Flying",
    type: "Seabird",
    species: "Hawaiian Petrel (Pterodroma sandwichensis)",
    behavior: "Flying",
  },
  {
    label: "Laysan Albatross - Courtship",
    type: "Seabird",
    species: "Laysan Albatross (Phoebastria immutabilis)",
    behavior: "Courtship",
  },
  {
    label: "Laysan Albatross - Nesting",
    type: "Seabird",
    species: "Laysan Albatross (Phoebastria immutabilis)",
    behavior: "Nesting",
  },
  {
    label: "Cat - Predation",
    type: "Predator",
    species: "Cat (Felis catus)",
    behavior: "Predation",
  },
  {
    label: "Cat - Passing through",
    type: "Predator",
    species: "Cat (Felis catus)",
    behavior: "Passing through",
  },
  {
    label: "Rat - Predation",
    type: "Predator",
    species: "Rat (Rattus sp.)",
    behavior: "Predation",
  },
  {
    label: "Mongoose - Hunting",
    type: "Predator",
    species: "Mongoose (Herpestes javanicus)",
    behavior: "Hunting",
  },
  {
    label: "Barn Owl - Hunting",
    type: "Predator",
    species: "Barn Owl (Tyto alba)",
    behavior: "Hunting",
  },
];

export function getSpeciesChoices(type: ObservationType) {
  return type === "Seabird" ? SEABIRD_SPECIES : PREDATOR_SPECIES;
}

export function getBehaviorChoices(type: ObservationType) {
  return type === "Seabird" ? SEABIRD_BEHAVIORS : PREDATOR_BEHAVIORS;
}

export interface DynamicChoices {
  cameras: string[];
  locations: string[];
  species: { name: string; type: ObservationType }[];
  behaviors: { name: string; type: ObservationType }[];
  templates: AnnotationTemplate[];
  teamMembers: string[];
}

export const fallbackChoices: DynamicChoices = {
  cameras: Array.from(CAMERAS),
  locations: Array.from(SITE_LOCATIONS),
  species: [
    ...SEABIRD_SPECIES.map((s) => ({ name: s, type: "Seabird" as const })),
    ...PREDATOR_SPECIES.map((s) => ({ name: s, type: "Predator" as const })),
  ],
  behaviors: [
    ...SEABIRD_BEHAVIORS.map((b) => ({ name: b, type: "Seabird" as const })),
    ...PREDATOR_BEHAVIORS.map((b) => ({ name: b, type: "Predator" as const })),
  ],
  templates: ANNOTATION_TEMPLATES,
  teamMembers: [],
};