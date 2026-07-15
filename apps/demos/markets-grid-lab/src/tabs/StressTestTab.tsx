import { LabFeatureTab } from './LabFeatureTab';
import { STRESS_TEST_FEATURE } from './labFeatureConfigs';

export function StressTestTab() {
  return <LabFeatureTab config={STRESS_TEST_FEATURE} />;
}
