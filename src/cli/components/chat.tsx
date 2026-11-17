import { memo } from 'react';
import { Box, Text } from 'ink';
import { ASSISTANT_INDENT } from '../markdown/layout.ts';
import { MarkdownMessage } from '../markdown/markdown.tsx';
import { useTheme } from '../theme/index.ts';
import type {
  ChatActivity,
  ChatEntry,
  ChatState,
} from '../state/chat.ts';

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
          {...(chat.active.refusal
            ? { color: theme.colors.role.refusal }
            : {})}
        />
      ) : null}
      {chat.activity ? (
        <Box
          paddingLeft={ASSISTANT_INDENT.left}
          paddingRight={ASSISTANT_INDENT.right}
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
            <Text color={theme.colors.role.userPrompt}>{'› '}</Text>
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
        {...(item.refusal ? { color: theme.colors.role.refusal } : {})}
      />
    );
  }
  if (item.type === 'tool') {
    return (
      <Box
        paddingLeft={ASSISTANT_INDENT.left}
        paddingRight={ASSISTANT_INDENT.right}
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
        paddingLeft={ASSISTANT_INDENT.left}
        paddingRight={ASSISTANT_INDENT.right}
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
