export type NavigationAgentProfileDefinition = {
  id: string;
  radius: number;
  height?: number | undefined;
  maxSlope?: number | undefined;
  allowedAreas?: string[] | undefined;
  costOverrides?: Record<string, number> | undefined;
  tags?: string[] | undefined;
};

export type NavigationAreaDefinition = {
  id: string;
  cost?: number | undefined;
  tags?: string[] | undefined;
};

export function cloneNavigationProfile(
  profile: NavigationAgentProfileDefinition
): NavigationAgentProfileDefinition {
  return {
    ...profile,
    ...(profile.allowedAreas === undefined ? {} : { allowedAreas: [...profile.allowedAreas] }),
    ...(profile.costOverrides === undefined ? {} : { costOverrides: { ...profile.costOverrides } }),
    ...(profile.tags === undefined ? {} : { tags: [...profile.tags] })
  };
}
