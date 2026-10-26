import { useEffect, useRef, useState } from 'react';
import type { Campaign, CampaignDetail, Project, RunReport } from '../shared/model';
import { api } from './bridge';

export function useCampaigns(
  project: Project | undefined,
  report: RunReport | null,
  onError: (error: unknown) => void,
) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const generation = useRef(0);
  const currentProject = useRef(project);
  currentProject.current = project;
  const refresh = async () => {
    const token = ++generation.current;
    const project = currentProject.current;
    if (!project || !api.campaignList) {
      setCampaigns([]);
      setDetail(null);
      return;
    }
    const list = await api.campaignList(project.id);
    const loaded = project.activeCampaignId
      ? await api.campaignLoad({ projectId: project.id, campaignId: project.activeCampaignId })
      : null;
    if (token !== generation.current) return;
    setCampaigns(list);
    setDetail(loaded);
  };
  useEffect(() => {
    setDetail(null);
    void refresh().catch(onError);
    return () => {
      generation.current++;
    };
  }, [project?.id, project?.activeCampaignId]);
  useEffect(() => {
    if (!report?.campaignId || report.projectId !== project?.id) return;
    setDetail((detail) => {
      if (!detail || detail.campaign.id !== report.campaignId) return detail;
      const reports = detail.reports.some((old) => old.id === report.id)
        ? detail.reports.map((old) => (old.id === report.id ? report : old))
        : [...detail.reports, report];
      return { ...detail, reports };
    });
  }, [report, project?.id]);
  return { campaigns, detail, refresh };
}
