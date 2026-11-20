import { memo } from 'react';
import { Box, Text, useAnimation } from 'ink';
import type { QueuedMessage } from '../../app/types.ts';
import { MarkdownMessage } from '../markdown/markdown.tsx';
import { useTheme } from '../theme/index.ts';
import type {
  ChatActivity,
  ChatEntry,
  ChatState,
  UserMessageStatus,
} from '../state/chat.ts';

const RUN_FRAMES = [
  '⠋', '⠙', '⠹', '⠸', '⠼',
  '⠴', '⠦', '⠧', '⠇', '⠏',
] as const;

export function Chat({
  chat,
}: {
  chat: ChatState;
}) {
  const theme = useTheme();
  return (
    <>
      {chat.active ? (
        <MarkdownMessage
          key={chat.active.id}
          messageId={chat.active.id}
          source={chat.active.text}
          streaming
          color={chat.active.refusal
            ? theme.colors.role.refusal
            : undefined}
        />
      ) : null}
      {chat.activity ? (
        <Box
          paddingLeft={3}
          paddingRight={2}
        >
          <Activity activity={chat.activity} />
        </Box>
      ) : null}
    </>
  );
}

export const ChatEntryView = memo(function ChatEntryView({
  item,
}: {
  item: ChatEntry;
}) {
  const theme = useTheme();
  if (item.type === 'user') {
    return (
      <Box
        width='100%'
        backgroundColor={theme.colors.surface.userMessage}
        paddingX={1}
        paddingY={1}
        marginBottom={1}
      >
        <Box alignItems='flex-start' flexDirection='row'>
          <Box width={2} flexShrink={0}>
            <UserMessagePrefix status={item.status} />
          </Box>
          <Box flexDirection='column' flexGrow={1} minWidth={0}>
            <Text color={theme.colors.text.primary} wrap='wrap'>
              {item.content}
            </Text>
          </Box>
        </Box>
      </Box>
    );
  }
  if (item.type === 'assistant') {
    return (
      <MarkdownMessage
        messageId={item.id}
        source={item.content}
        color={item.refusal ? theme.colors.role.refusal : undefined}
      />
    );
  }
  if (item.type === 'tool') {
    return (
      <Box
        paddingLeft={3}
        paddingRight={2}
        marginBottom={1}
        flexDirection='column'
      >
        <Text color={item.status === 'error'
          ? theme.colors.feedback.error
          : theme.colors.text.muted}
        >
          {item.name} · {item.status}
        </Text>
        {item.summary ? (
          <Text color={theme.colors.feedback.warning} wrap='wrap'>
            {item.summary}
          </Text>
        ) : null}
      </Box>
    );
  }
  if (item.type === 'notice') {
    return (
      <Box
        paddingLeft={3}
        paddingRight={2}
        marginBottom={1}
      >
        <Text color={theme.colors.feedback[item.level]} wrap='wrap'>
          {item.message}
        </Text>
      </Box>
    );
  }
  return null;
});

function UserMessagePrefix({
  status,
}: {
  status: UserMessageStatus;
}) {
  const theme = useTheme();
  if (status === 'queued') {
    return (
      <Text color={theme.colors.text.muted}>
        ○
      </Text>
    );
  }
  if (status === 'blocked') {
    return (
      <Text color={theme.colors.feedback.warning}>
        !
      </Text>
    );
  }
  if (status === 'running') {
    return <RunningMark />;
  }
  if (status === 'completed') {
    return (
      <Text color={theme.colors.text.muted}>
        ✓
      </Text>
    );
  }
  if (status === 'failed') {
    return (
      <Text color={theme.colors.feedback.error}>
        ×
      </Text>
    );
  }
  return (
    <Text color={theme.colors.feedback.warning}>
      −
    </Text>
  );
}

function RunningMark() {
  const theme = useTheme();
  const { frame } = useAnimation({ interval: 80 });
  const mark = RUN_FRAMES[frame % RUN_FRAMES.length];
  return <Text color={theme.colors.role.activity}>{mark} </Text>;
}

export function QueuedMessages({
  messages,
  blocked,
}: {
  messages: readonly QueuedMessage[];
  blocked: boolean;
}) {
  return messages.map(message => (
    <ChatEntryView
      key={message.id}
      item={{
        id: `queued:${message.id}`,
        type: 'user',
        content: message.content,
        status: blocked ? 'blocked' : 'queued',
      }}
    />
  ));
}

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
  const theme = useTheme();
  let text: string;
  if (activity.type === 'thinking') {
    text = 'Thinking...';
  } else if (activity.type === 'compacting') {
    text = 'Compacting context...';
  } else if (activity.type === 'waiting') {
    text = `Waiting for ${activity.modelId}...`;
  } else {
    text = `Running ${activity.name}...`;
  }
  return (
    <Text color={theme.colors.role.activity}>
      {text}
    </Text>
  );
}
