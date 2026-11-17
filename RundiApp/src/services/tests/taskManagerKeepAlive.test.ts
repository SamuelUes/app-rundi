import { AppRegistry, Platform } from 'react-native';
import { beginTaskManagerWork, endTaskManagerWork, registerTaskManagerKeepAlive } from '../map/taskManagerKeepAlive';

test('keeps the headless task alive until all overlapping location events finish', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const register = jest.spyOn(AppRegistry, 'registerHeadlessTask').mockImplementation(() => {});
  registerTaskManagerKeepAlive();
  const provider = register.mock.calls[0][1] as () => () => Promise<void>;
  const task = provider()();
  let finished = false;
  void task.then(() => { finished = true; });
  beginTaskManagerWork();
  beginTaskManagerWork();
  endTaskManagerWork();
  await Promise.resolve();
  expect(finished).toBe(false);
  endTaskManagerWork();
  await task;
  expect(finished).toBe(true);
  register.mockRestore();
  jest.restoreAllMocks();
});

test('does not strand a headless task when location processing finishes first', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const register = jest.spyOn(AppRegistry, 'registerHeadlessTask').mockImplementation(() => {});
  registerTaskManagerKeepAlive();
  beginTaskManagerWork();
  endTaskManagerWork();
  const provider = register.mock.calls[0][1] as () => () => Promise<void>;
  await provider()();
  register.mockRestore();
  jest.restoreAllMocks();
});
