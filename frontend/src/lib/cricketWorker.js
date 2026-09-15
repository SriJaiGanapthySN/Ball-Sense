import { simulateChase, SIMULATION_TRIALS } from "./cricketGames.js";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      baseline: simulateChase(data.baseline, { trials: SIMULATION_TRIALS, seed: data.seed }),
      alternate: simulateChase(data.alternate, { trials: SIMULATION_TRIALS, seed: data.seed }),
    });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};