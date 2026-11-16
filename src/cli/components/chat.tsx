import { memo } from 'react';
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
      {chat.active ? (
        <Box paddingX={1} marginBottom={1}>
          <ActiveMessage active={chat.active} />
        </Box>
      ) : null}
      {chat.activity ? (
        <Box paddingX={1}>
          <Activity activity={chat.activity} />
        </Box>
      ) : null}
    </>
  );
}

function ActiveMessage({ active }: { active: ActiveResponse }) {
  return (
    <Text
      {...(active.refusal ? { color: '#E5C07B' } : {})}
      wrap='wrap'
    >
      {active.text}
      <Text color='#61AFEF'>▌</Text>
    </Text>
  );
}

export const ChatEntryView = memo(function ChatEntryView({
  item,
}: {
  item: ChatEntry;
}) {
  if (item.type === 'user') {
    return (
      <Box
        width='100%'
        backgroundColor='#373B43'
        paddingX={1}
        paddingY={1}
        marginBottom={1}
      >
        <Text color='#E6E6E6' wrap='wrap'>{item.content}</Text>
      </Box>
    );
  }
  if (item.type === 'assistant') {
    const hasGap = item.streamPart === undefined
      || item.streamPart === 'end'
      || item.streamPart === 'only';
    return (
      <Box
        paddingX={1}
        marginBottom={hasGap ? 1 : 0}
        flexDirection='column'
      >
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
});

export const CompletedTranscript = memo(function CompletedTranscript({
  items,
}: {
  items: readonly ChatEntry[];
}) {
  return items.map(item => (
    <ChatEntryView key={item.id} item={item} />
  ));
});

function Activity({ activity }: { activity: ChatActivity }) {
  const text = activity.type === 'thinking'
    ? 'Thinking...'
    : activity.type === 'compacting'
      ? 'Compacting context...'
      : activity.type === 'waiting'
        ? `Waiting for ${activity.modelId}...`
        : `Running ${activity.name}...`;
  return (
    <Text color='#7F848E'>{text}</Text>
  );
}
