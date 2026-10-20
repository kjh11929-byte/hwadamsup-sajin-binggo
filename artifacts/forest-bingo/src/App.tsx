import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, Link, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, ChevronRight, ImagePlus, LockKeyhole, LogOut, Mountain, RefreshCw, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  getGetAdminOverviewQueryKey, getGetAdminSessionQueryKey, getGetBingoTeamQueryKey,
  getListBingoTeamsQueryKey, useAdminLogin, useAdminLogout, useGetAdminOverview,
  useGetAdminSession, useGetBingoTeam, useListBingoTeams, useRequestBingoPhotoUpload,
  useSaveBingoPhoto, useUpdateBingoMission,
} from '@workspace/api-client-react';
import type { BingoCell, BingoTeam, Mission } from '@workspace/api-client-react';
import './app.css';

const queryClient = new QueryClient();

function Brand() {
  return <Link href="/" className="brand" data-testid="link-home"><span className="brand-mark"><Mountain size={18} /></span><span>화담숲 <i>사진 빙고</i></span></Link>;
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="forest-grain page-shell"><header className="topbar"><Brand /><span className="event-tag"><span className="live-dot" />교사 함께 걷기</span></header>{children}<footer className="site-footer">화담숲에서 만나는 작은 발견들 <span>·</span> 오늘의 추억을 사진으로</footer></main>;
}

function LoadingState({ label = '숲의 기록을 불러오는 중' }: { label?: string }) {
  return <section className="state-card" aria-live="polite"><div className="skeleton-sigil"><Mountain size={24} /></div><p>{label}</p><div className="skeleton-line" /><div className="skeleton-line short" /></section>;
}

function ErrorState({ retry }: { retry: () => void }) {
  return <section className="state-card error-state"><div className="state-icon"><RefreshCw size={22} /></div><h2>잠시 길을 잃었어요</h2><p>연결이 잠깐 끊겼습니다. 다시 불러와 주세요.</p><button className="button button-primary" onClick={retry} data-testid="button-retry"><RefreshCw size={16} /> 다시 불러오기</button></section>;
}

function HomePage() {
  const [, navigate] = useLocation();
  const teamsQuery = useListBingoTeams({ query: { queryKey: getListBingoTeamsQueryKey(), refetchInterval: 12000 } });
  const teams = teamsQuery.data ?? [];
  const complete = teams.filter((team) => team.filledCount >= 9).length;
  return <Shell><section className="home-hero fade-up">
    <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" />화담숲 미션 산책</div><h1>숲을 담고,<br /><em>함께 빙고!</em></h1><p className="hero-description">오늘의 숲에서 발견한 순간을<br />사진으로 모아 한 칸씩 채워보세요.</p><div className="hero-stamp"><Sparkles size={15} /> 9개의 미션 · 8개의 팀</div></div>
    <div className="hero-art" aria-hidden="true"><div className="sun-disc" /><div className="hill hill-back" /><div className="hill hill-mid" /><div className="hill hill-front" /><div className="tree tree-one" /><div className="tree tree-two" /><div className="tree tree-three" /><div className="art-caption">HWADAM<br /><small>FOREST WALK</small></div></div>
  </section>
  <section className="team-section fade-up">
    <div className="section-heading"><div><div className="eyebrow">함께하는 팀</div><h2>우리 조를 선택해요</h2></div><span className="subtle-note">현재 진행 상황</span></div>
    {teamsQuery.isLoading ? <div className="team-grid">{Array.from({ length: 8 }, (_, i) => <div className="team-skeleton" key={i} />)}</div> : teamsQuery.isError ? <ErrorState retry={() => void teamsQuery.refetch()} /> : <div className="team-grid">{Array.from({ length: 8 }, (_, index) => {
      const number = index + 1;
      const team = teams.find((item) => item.teamNumber === number);
      const filled = team?.filledCount ?? 0;
      const isDone = filled >= 9;
      return <button className={`team-tile ${isDone ? 'team-done' : ''}`} key={number} onClick={() => navigate(`/team/${number}`)} data-testid={`button-team-${number}`}>
        <span className="team-number">{String(number).padStart(2, '0')}</span><span className="team-name">{number}조</span><span className="team-status">{isDone ? <><CheckCircle2 size={13} /> 완성</> : `${filled}/9 미션`}</span><span className="team-progress"><i style={{ width: `${Math.min(filled / 9 * 100, 100)}%` }} /></span><ChevronRight className="team-chevron" size={16} />
      </button>;
    })}</div>}
    <div className="progress-summary"><div className="summary-icon"><Camera size={17} /></div><div><strong>{teams.reduce((total, team) => total + team.filledCount, 0)}<small> / 72</small></strong><span>사진이 모였어요</span></div><div className="summary-divider" /><div className="summary-finished"><strong>{complete}</strong><span>팀 빙고 완성</span></div></div>
    <div className="howto"><div className="howto-count">01—03</div><p><b>미션을 확인하고</b> → 순간을 찍고 → 사진을 올리면 끝!</p><span>한 줄을 완성하면 빙고예요</span></div>
  </section></Shell>;
}

function PhotoPreview({ imageUrl, alt }: { imageUrl: string; alt: string }) {
  return <img src={imageUrl} alt={alt} className="mission-photo" loading="lazy" />;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 2.5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;

async function preparePhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('사진은 10MB 이하로 올려주세요.');
    return file;
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('사진을 줄일 수 없어요. 10MB 이하의 사진을 선택해 주세요.');
    return file;
  }
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= TARGET_IMAGE_BYTES) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('사진을 줄일 수 없어요. 10MB 이하의 사진을 선택해 주세요.');
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('사진을 처리하지 못했어요.')), 'image/jpeg', 0.84));
    for (const quality of [0.72, 0.58]) {
      if (blob.size <= TARGET_IMAGE_BYTES) break;
      blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('사진을 처리하지 못했어요.')), 'image/jpeg', quality));
    }
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('사진은 10MB 이하로 올려주세요.');
    const filename = file.name.replace(/\.[^.]+$/, '') || 'forest-photo';
    return new File([blob], `${filename}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } finally { bitmap.close(); }
}

function TeamPage() {
  const params = useParams<{ teamNumber: string }>();
  const [, navigate] = useLocation();
  const teamNumber = Number(params.teamNumber);
  const valid = Number.isInteger(teamNumber) && teamNumber >= 1 && teamNumber <= 8;
  const teamQuery = useGetBingoTeam(teamNumber, { query: { enabled: valid, queryKey: getGetBingoTeamQueryKey(teamNumber), refetchInterval: 12000 } });
  const team = teamQuery.data;
  const [busyMission, setBusyMission] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState('');
  const requestUpload = useRequestBingoPhotoUpload();
  const savePhoto = useSaveBingoPhoto();
  const qc = useQueryClient();
  const cells = team?.cells ?? [];
  const isBusy = requestUpload.isPending || savePhoto.isPending;
  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>, cell: BingoCell) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadError('');
    if (!file.type.startsWith('image/')) { setUploadError('사진 파일을 선택해 주세요.'); return; }
    setBusyMission(cell.missionNumber);
    try {
      const prepared = await preparePhoto(file);
      if (prepared.size > MAX_UPLOAD_BYTES) throw new Error('사진은 10MB 이하로 올려주세요.');
      const originalName = file.name.slice(0, 255);
      const upload = await requestUpload.mutateAsync({ data: { teamNumber, missionNumber: cell.missionNumber, originalName, contentType: prepared.type, size: prepared.size } });
      const form = new FormData();
      form.append('file', prepared);
      form.append('api_key', upload.apiKey);
      form.append('timestamp', String(upload.timestamp));
      form.append('signature', upload.signature);
      form.append('folder', upload.folder);
      form.append('public_id', upload.publicId);
      form.append('overwrite', 'false');
      const response = await fetch(upload.uploadUrl, { method: 'POST', body: form });
      const result = await response.json() as { secure_url?: string; public_id?: string; error?: { message?: string } };
      if (!response.ok || !result.secure_url || !result.public_id) throw new Error(result.error?.message || '사진을 저장하지 못했습니다.');
      await savePhoto.mutateAsync({ teamNumber, missionNumber: cell.missionNumber, data: { imageUrl: result.secure_url, publicId: result.public_id, originalName, contentType: prepared.type, size: prepared.size } });
      await Promise.all([qc.invalidateQueries({ queryKey: getGetBingoTeamQueryKey(teamNumber) }), qc.invalidateQueries({ queryKey: getListBingoTeamsQueryKey() })]);
    } catch (error) { setUploadError(error instanceof Error ? error.message : '사진 업로드에 실패했어요. 다시 시도해 주세요.'); }
    finally { setBusyMission(null); }
  };
  if (!valid) return <Shell><ErrorState retry={() => navigate('/')} /></Shell>;
  if (teamQuery.isLoading) return <Shell><LoadingState label={`${teamNumber}조 빙고판을 준비하고 있어요`} /></Shell>;
  if (teamQuery.isError || !team) return <Shell><ErrorState retry={() => void teamQuery.refetch()} /></Shell>;
  const progress = team.filledCount;
  return <Shell><section className="board-page fade-up">
    <Link href="/" className="back-link" data-testid="link-back-home"><ArrowLeft size={17} /> 전체 조 보기</Link>
    <div className="board-heading"><div><div className="eyebrow">HWADAM FOREST · PHOTO MISSION</div><h1><span className="board-team-number">{String(teamNumber).padStart(2, '0')}</span> {teamNumber}조</h1><p>미션을 사진으로 기록해 보세요.</p></div><div className="board-progress"><strong>{progress}<small>/9</small></strong><span>완료</span></div></div>
    <div className="board-progress-track"><i style={{ width: `${progress / 9 * 100}%` }} /></div>
    <div className="board-bingo-note"><span className="bingo-mark">B</span><span><b>{team.bingoLineCount}줄 빙고</b><small>가로·세로·대각선 한 줄 완성!</small></span><Sparkles className="note-spark" size={16} /></div>
    {uploadError && <div className="upload-alert" role="alert"><span>{uploadError}</span><button onClick={() => setUploadError('')} aria-label="오류 닫기"><X size={16} /></button></div>}
    <div className="bingo-board" data-testid="grid-mission-board">{cells.map((cell, index) => <article className={`mission-cell ${cell.photo ? 'cell-filled' : ''} ${busyMission === cell.missionNumber ? 'cell-uploading' : ''}`} key={cell.missionNumber}>
      <span className="mission-index">{String(cell.missionNumber).padStart(2, '0')}</span>
      {cell.photo ? <><div className="cell-image"><PhotoPreview imageUrl={cell.photo.imageUrl} alt={`${cell.description} 사진`} /><span className="photo-check"><Check size={13} /></span></div><div className="cell-copy"><p>{cell.description}</p><small className="photo-name">{cell.photo.originalName}</small></div></>
        : <><div className="cell-empty-art"><span>{index + 1}</span><ImagePlus size={19} /></div><p className="cell-description">{cell.description}</p><label className="upload-button" htmlFor={`photo-${cell.missionNumber}`}><Camera size={14} /> 사진 올리기</label><input id={`photo-${cell.missionNumber}`} type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={(event) => void handlePhoto(event, cell)} disabled={isBusy} data-testid={`input-photo-${cell.missionNumber}`} /></>}
      {busyMission === cell.missionNumber && <div className="uploading-overlay"><span className="uploading-ring" /><b>사진을 담는 중</b></div>}
    </article>)}</div>
    <div className="board-tip"><span className="tip-dash" />사진 한 장이면 미션 완료!<span className="tip-dash" /></div>
    {team.completedAt && <div className="completion-banner"><Sparkles size={18} /><span><b>빙고 완성!</b> 숲에서의 추억을 모두 모았어요.</span>{team.completionRank && <strong>완성 {team.completionRank}위</strong>}</div>}
    <button className="board-home-button" onClick={() => navigate('/')} data-testid="button-all-teams"><ArrowLeft size={16} /> 다른 조 진행 상황 보기</button>
  </section></Shell>;
}

function AdminLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const login = useAdminLogin();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setErrorText('');
    try { await login.mutateAsync({ data: { password } }); await qc.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); onLoggedIn(); }
    catch { setErrorText('비밀번호를 확인해 주세요.'); }
  };
  return <section className="admin-login fade-up"><div className="admin-lock"><LockKeyhole size={21} /></div><div className="eyebrow">관리자 전용</div><h1>오늘의 숲을<br /><em>살펴볼까요?</em></h1><p>관리자 비밀번호를 입력해 주세요.</p><form onSubmit={(event) => void submit(event)}><label htmlFor="admin-password">비밀번호</label><input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호 입력" autoComplete="current-password" required data-testid="input-admin-password" />{errorText && <div className="login-error" role="alert">{errorText}</div>}<button className="button button-primary admin-submit" type="submit" disabled={login.isPending || !password} data-testid="button-admin-login">{login.isPending ? '확인 중…' : <>관리자 페이지 입장 <ArrowRight size={16} /></>}</button></form><div className="secure-note"><ShieldCheck size={14} /> 관리자에게만 공개되는 페이지입니다</div></section>;
}

function AdminDashboard() {
  const overviewQuery = useGetAdminOverview();
  const logout = useAdminLogout();
  const qc = useQueryClient();
  const updateMission = useUpdateBingoMission();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savedMission, setSavedMission] = useState<number | null>(null);
  const overview = overviewQuery.data;
  const teams = [...(overview?.teams ?? [])].sort((a, b) => {
    if (a.completionRank && b.completionRank) return a.completionRank - b.completionRank;
    if (a.completionRank) return -1; if (b.completionRank) return 1;
    return b.filledCount - a.filledCount || a.teamNumber - b.teamNumber;
  });
  const saveMission = async (mission: Mission) => {
    const description = drafts[mission.missionNumber]?.trim();
    if (!description || description === mission.description) return;
    try {
      await updateMission.mutateAsync({ missionNumber: mission.missionNumber, data: { description } });
      setSavedMission(mission.missionNumber);
      await qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
      window.setTimeout(() => setSavedMission((n) => n === mission.missionNumber ? null : n), 2000);
    } catch { window.alert('미션 설명을 저장하지 못했어요. 다시 시도해 주세요.'); }
  };
  const signOut = async () => { await logout.mutateAsync(); await qc.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); };
  if (overviewQuery.isLoading) return <LoadingState label="전체 팀의 기록을 모으는 중" />;
  if (overviewQuery.isError || !overview) return <ErrorState retry={() => void overviewQuery.refetch()} />;
  const totalPhotos = overview.teams.reduce((sum, team) => sum + team.filledCount, 0);
  return <section className="admin-dashboard fade-up">
    <div className="admin-header"><div><div className="eyebrow">숲길 기록실</div><h1>오늘의 빙고 현황</h1><p>모든 조의 사진과 미션 진행을 한눈에 봅니다.</p></div><button className="logout-button" onClick={() => void signOut()} disabled={logout.isPending} data-testid="button-admin-logout"><LogOut size={15} /> 나가기</button></div>
    <div className="admin-stats"><div className="admin-stat"><span>모인 사진</span><strong>{totalPhotos}<small> / 72</small></strong><i className="stat-photo"><Camera size={15} /></i></div><div className="admin-stat"><span>완성한 팀</span><strong>{overview.teams.filter((team) => team.filledCount >= 9).length}<small> / 8</small></strong><i><CheckCircle2 size={15} /></i></div><div className="admin-stat"><span>전체 빙고 줄</span><strong>{overview.teams.reduce((sum, team) => sum + team.bingoLineCount, 0)}</strong><i><Sparkles size={15} /></i></div></div>
    <div className="admin-section-title"><div><div className="eyebrow">TEAM MONITOR</div><h2>조별 진행 상황</h2></div><span>{overview.teams.length}개 팀</span></div>
    <div className="admin-team-list">{teams.map((team, index) => <AdminTeamRow team={team} rank={team.completionRank ?? (team.filledCount >= 9 ? index + 1 : null)} key={team.teamNumber} />)}</div>
    <section className="mission-editor"><div className="admin-section-title"><div><div className="eyebrow">MISSION EDITOR</div><h2>미션 설명</h2></div><span>수정 후 저장</span></div>{overview.missions.map((mission) => <div className="mission-edit-row" key={mission.missionNumber}><span className="edit-number">{String(mission.missionNumber).padStart(2, '0')}</span><input aria-label={`${mission.missionNumber}번 미션 설명`} value={drafts[mission.missionNumber] ?? mission.description} onChange={(event) => setDrafts((current) => ({ ...current, [mission.missionNumber]: event.target.value }))} maxLength={500} data-testid={`input-mission-${mission.missionNumber}`} /><button onClick={() => void saveMission(mission)} disabled={updateMission.isPending || !(drafts[mission.missionNumber]?.trim()) || (drafts[mission.missionNumber] ?? mission.description) === mission.description} data-testid={`button-save-mission-${mission.missionNumber}`}>{savedMission === mission.missionNumber ? <><Check size={14} /> 저장됨</> : '저장'}</button></div>)}</section>
  </section>;
}

function AdminTeamRow({ team, rank }: { team: BingoTeam; rank: number | null }) {
  return <details className="admin-team-row"><summary><span className={`admin-team-badge ${team.filledCount === 9 ? 'badge-complete' : ''}`}>{String(team.teamNumber).padStart(2, '0')}</span><span className="admin-row-name">{team.teamNumber}조 {rank ? <small>완성 {rank}위</small> : null}</span><span className="admin-row-meter"><i style={{ width: `${team.filledCount / 9 * 100}%` }} /></span><span className="admin-row-count">{team.filledCount}<small>/9</small></span><ChevronRight className="row-chevron" size={16} /></summary><div className="admin-photos">{team.cells.map((cell) => <div className={`admin-photo-thumb ${cell.photo ? '' : 'thumb-empty'}`} key={cell.missionNumber}>{cell.photo ? <><PhotoPreview imageUrl={cell.photo.imageUrl} alt={`${team.teamNumber}조 ${cell.missionNumber}번`} /><span>{cell.missionNumber}. {cell.description}</span></> : <span>{cell.missionNumber}. {cell.description}</span>}</div>)}</div><div className="admin-row-foot"><span>{team.bingoLineCount}줄 빙고</span>{team.completedAt && <span>완성 {new Date(team.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>}</div></details>;
}

function AdminPage() {
  const sessionQuery = useGetAdminSession();
  const [, navigate] = useLocation();
  if (sessionQuery.isLoading) return <Shell><LoadingState label="관리자 권한을 확인하는 중" /></Shell>;
  const authenticated = Boolean(sessionQuery.data?.authenticated);
  return <Shell><div className="admin-page">{authenticated ? <AdminDashboard /> : <><Link href="/" className="back-link admin-back"><ArrowLeft size={17} /> 빙고로 돌아가기</Link><AdminLogin onLoggedIn={() => void sessionQuery.refetch()} /></>}</div></Shell>;
}

function Router() {
  return <ErrorBoundary><Switch><Route path="/" component={HomePage} /><Route path="/team/:teamNumber" component={TeamPage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
