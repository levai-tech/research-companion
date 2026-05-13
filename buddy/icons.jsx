// Icon set — lucide-style stroke icons, inlined as a small React module so
// every kit screen pulls from the same source of truth and we don't need
// to ship a runtime icon-font dependency.
//
// Stroke: 1.5 px at 24x24 viewBox, rounded caps + joins. Color inherits
// currentColor so icons follow text color.

const baseProps = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const make = (paths) => function Icon(props) {
  return (
    <svg {...baseProps} {...props}>
      {paths}
    </svg>
  );
};

const IconSettings = make(
  <g>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.7.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.7.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.7-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.7v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </g>
);

const IconBook = make(
  <g>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </g>
);

const IconNewChat = make(
  <g>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    <path d="M12 8v6M9 11h6" />
  </g>
);

const IconSearch = make(
  <g>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </g>
);

const IconFile = make(
  <g>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </g>
);

const IconTrash = make(
  <g>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </g>
);

const IconBack = make(<path d="M19 12H5M12 19l-7-7 7-7" />);

const IconPlus = make(<path d="M12 5v14M5 12h14" />);

const IconSend = make(<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />);

const IconSparkles = make(
  <g>
    <path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
    <path d="M18 14v4M20 16h-4M5 17v3M6.5 18.5h-3" />
  </g>
);

const IconCheck = make(<path d="m20 6-11 11-5-5" />);

const IconX = make(<path d="m18 6-12 12M6 6l12 12" />);

const IconChevronRight = make(<path d="m9 18 6-6-6-6" />);

const IconArrowUp = make(<path d="M12 19V5M5 12l7-7 7 7" />);

const IconPanelRight = make(
  <g>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M15 3v18" />
  </g>
);

const IconLink = make(
  <g>
    <path d="M10 13a5 5 0 0 0 7 0l4-4a5 5 0 1 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l1-1" />
  </g>
);

const IconUpload = make(
  <g>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8 12 3 7 8" />
    <path d="M12 3v12" />
  </g>
);

const IconMic = make(
  <g>
    <rect x="9" y="2" width="6" height="13" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </g>
);

const IconPaperclip = make(
  <path d="M21.4 11 12.2 20.2a5 5 0 0 1-7-7l9.2-9.2a3.4 3.4 0 0 1 4.9 4.9l-9.3 9.2a1.8 1.8 0 0 1-2.5-2.5l8.5-8.5" />
);

Object.assign(window, {
  IconSettings, IconBook, IconNewChat, IconSearch, IconFile, IconTrash,
  IconBack, IconPlus, IconSend, IconSparkles, IconCheck, IconX,
  IconChevronRight, IconArrowUp, IconPanelRight, IconLink, IconUpload,
  IconMic, IconPaperclip,
});
