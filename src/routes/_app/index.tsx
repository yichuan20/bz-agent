import {
  ArrowRightIcon,
  ChatCircleDotsIcon,
  LightningIcon,
  ShapesIcon,
} from '@phosphor-icons/react';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/')({
  component: Home,
});

const cards = [
  {
    icon: LightningIcon,
    title: 'Fast by default',
    description: 'Built on Vite with TanStack Router for instant navigation and smart prefetching.',
  },
  {
    icon: ShapesIcon,
    title: 'Component ready',
    description: 'Plain CSS with a single design token file — swap the import to restyle everything.',
  },
  {
    icon: ChatCircleDotsIcon,
    title: 'AI chat built in',
    description: 'Integrated AI chat with tool calling, streaming responses, and a floating bubble UI.',
  },
];

function Home() {
  return (
    <div className="page">
      <div>
        <h1 className="page-title">Welcome</h1>
        <p className="page-subtitle">This is your app template. Start building something great.</p>
      </div>

      <div className="card-grid">
        {cards.map(card => (
          <div key={card.title} className="card card-content">
            <div className="card-icon">
              <card.icon size={18} weight="duotone" />
            </div>
            <p className="card-title">{card.title}</p>
            <p className="card-description">{card.description}</p>
          </div>
        ))}
      </div>

      <div className="cta-bar">
        <div className="cta-bar-text">
          <p className="card-title">Try the AI chat</p>
          <p className="card-description cta-bar-description">
            Ask questions, run tools, and get streaming responses.
          </p>
        </div>
        <Link to="/chat" className="btn-accent flex-row">
          Open Chat <ArrowRightIcon size={14} />
        </Link>
      </div>
    </div>
  );
}
