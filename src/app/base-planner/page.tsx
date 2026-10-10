import { Metadata } from 'next';
import BasePlanner from './BasePlanner';

export const metadata: Metadata = {
  title: 'Turret Planner - Free Infantry CTF',
  description: 'Plan engineer turret setups in the Twin Peaks flag rooms: drag rockets, MGs, sentries and plasma turrets around the real base art, with the zone\'s collision, build limits and turret sight.',
};

export default function BasePlannerPage() {
  return <BasePlanner />;
}
