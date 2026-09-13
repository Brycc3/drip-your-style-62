const blocked = async () => {
  throw new Error(
    "Server actions are unavailable in this fixture review; no real backend is connected.",
  );
};
export const exportMyData = blocked;
export const deleteMyAccount = blocked;
export const createReport = blocked;
export const attachReportScreenshot = blocked;
export const attachProblemScreenshot = blocked;
export const createProblemReport = blocked;
export const useServerFn = (fn: unknown) => fn;
export const getPublicOutfitCovers = blocked;
