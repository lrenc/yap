import { Box, Text } from 'ink';
import type {
  ActiveResponse,
  ChatActivity,
  ChatEntry,
  ChatState,
} from '../state/chat.ts';

const NOTICE_COLORS = {
  info: '#B4B5BC',
  warning: '#E5C07B',
  error: '#E06C75',
} as const;

export function Chat({
  chat,
}: {
  chat: ChatState;
}) {
  return (
    <>
      {chat.active?.text ? (
        <ActiveMessage active={chat.active} />
      ) : null}
      {chat.activity ? (
        <Activity activity={chat.activity} />
      ) : null}
    </>
  );
}

export function ChatEntryView({ item }: { item: ChatEntry }) {
  if (item.type === 'user') {
    return (
      <Box paddingX={1} marginBottom={1} flexDirection='column'>
        <Text bold color='#61AFEF'>You</Text>
        <Text wrap='wrap'>{item.content}</Text>
      </Box>
    );
  }
  if (item.type === 'assistant') {
    return (
      <Box paddingX={1} marginBottom={1} flexDirection='column'>
        <Text bold color='#98C379'>YAP</Text>
        <Text
          {...(item.refusal ? { color: '#E5C07B' } : {})}
          wrap='wrap'
        >
          {item.content}
        </Text>
      </Box>
    );
  }
  if (item.type === 'tool') {
    return (
      <Box paddingX={1} marginBottom={1} flexDirection='column'>
        <Text color={item.status === 'error' ? '#E06C75' : '#7F848E'}>
          {item.name} · {item.status}
        </Text>
        {item.summary ? (
          <Text color='#E5C07B' wrap='wrap'>
            {item.summary}
          </Text>
        ) : null}
      </Box>
    );
  }
  if (item.type === 'notice') {
    return (
      <Box paddingX={1} marginBottom={1}>
        <Text color={NOTICE_COLORS[item.level]} wrap='wrap'>
          {item.message}
        </Text>
      </Box>
    );
  }
  return (
    <Box paddingX={1} marginBottom={1}>
      <Text color='#7F848E'>──── {item.label} ────</Text>
    </Box>
  );
}

function ActiveMessage({ active }: { active: ActiveResponse }) {
  return (
    <Box paddingX={1} marginBottom={1} flexDirection='column'>
      <Text bold color='#98C379'>YAP</Text>
      <Text
        {...(active.refusal ? { color: '#E5C07B' } : {})}
        wrap='wrap'
      >
        {active.text}
        <Text color='#61AFEF'>▌</Text>
      </Text>
    </Box>
  );
}

function Activity({ activity }: { activity: ChatActivity }) {
  const text = activity.type === 'thinking'
    ? 'Thinking...'
    : activity.type === 'compacting'
      ? 'Compacting context...'
      : activity.type === 'waiting'
        ? `Waiting for ${activity.modelId}...`
        : `Running ${activity.name}...`;
  return (
    <Box paddingX={1}>
      <Text color='#7F848E'>{text}</Text>
    </Box>
  );
}
