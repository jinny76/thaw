import { useRoute } from './ui/useRoute.js';
import { LandingPage } from './ui/LandingPage.js';
import { CreatePage } from './ui/CreatePage.js';
import { JoinPage } from './ui/JoinPage.js';
import { ChatWindow } from './ui/ChatWindow.js';

export function App() {
  const route = useRoute();

  if (route.roomId) {
    // 房主入口：链接带 #host= fragment（口令+昵称，未上网）→ 直接以创建者身份进房。
    if (route.host) {
      return (
        <ChatWindow
          mode={{
            kind: 'create',
            roomId: route.roomId,
            passphrase: route.host.passphrase,
            nickname: route.host.nickname,
          }}
        />
      );
    }
    // 普通受邀方 → 加入页输口令。
    return <JoinPage roomId={route.roomId} />;
  }
  if (route.path === '/create') {
    return <CreatePage />;
  }
  return <LandingPage />;
}
