import { useEffect, useState, type FormEvent } from 'react';
import { Check, Database, LockKeyhole, Save, UserRound } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useIdentity } from '../features/auth/AuthProvider';
import { api, type AthleteProfileInput } from '../lib/api';

const EMPTY: AthleteProfileInput = {
  display_name: '',
  fitness_goal: null,
  experience_level: null,
  preferred_units: 'metric',
  height_cm: null,
  weight_kg: null,
  weekly_workout_target: null,
};

export function ProfilePage() {
  const identity = useIdentity();
  const [profile, setProfile] = useState<AthleteProfileInput>(EMPTY);
  const [loading, setLoading] = useState(identity.authenticated);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const totalHeightInches = profile.height_cm === null ? null : profile.height_cm / 2.54;
  const heightFeet = totalHeightInches === null ? '' : Math.floor(totalHeightInches / 12);
  const heightInches = totalHeightInches === null ? '' : Number((totalHeightInches % 12).toFixed(1));
  const weightPounds = profile.weight_kg === null ? '' : Number((profile.weight_kg * 2.2046226218).toFixed(1));

  function setImperialHeight(feet: number | '', inches: number | '') {
    if (feet === '' && inches === '') {
      setProfile({ ...profile, height_cm: null });
      return;
    }
    setProfile({ ...profile, height_cm: (Number(feet) * 12 + Number(inches)) * 2.54 });
  }

  useEffect(() => {
    if (!identity.authenticated) return;
    setLoading(true);
    void api
      .profile()
      .then((value) => setProfile(value))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to load profile.'))
      .finally(() => setLoading(false));
  }, [identity.authenticated]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!profile.fitness_goal || !profile.experience_level || !profile.weekly_workout_target) return;
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const updated = await api.updateProfile(profile);
      setProfile(updated);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  }

  if (!identity.authenticated) {
    return (
      <div className="page profile-page">
        <section className="panel profile-signin">
          <span className="profile-hero-icon"><LockKeyhole /></span>
          <span className="eyebrow">PRIVATE ATHLETE PROFILE</span>
          <h1>Sign in to shape your training.</h1>
          <p>Your profile is linked to your account and used to personalize goals and progress.</p>
          <Button onClick={identity.login}>Sign in to continue</Button>
        </section>
      </div>
    );
  }

  return (
    <div className="page profile-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR TRAINING, PERSONALIZED</span>
          <h1>Athlete profile<span className="green-text">.</span></h1>
          <p>Set the details Gym Lens uses to understand your goals and progress.</p>
        </div>
        <span className="profile-status"><Database size={15} /> Stored in Tiger Data</span>
      </div>

      <div className="profile-layout">
        <form className="panel profile-form" onSubmit={submit}>
          <div className="profile-section-heading">
            <span className="profile-hero-icon"><UserRound /></span>
            <div><h2>About you</h2><p>Required fields are marked with an asterisk.</p></div>
          </div>
          {loading ? <p className="loading-text">Loading your profile…</p> : (
            <>
              <div className="profile-field full">
                <label htmlFor="display-name">Display name *</label>
                <input id="display-name" required maxLength={100} value={profile.display_name}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
              </div>
              <div className="profile-fields">
                <div className="profile-field">
                  <label htmlFor="goal">Primary goal *</label>
                  <select id="goal" required value={profile.fitness_goal || ''}
                    onChange={(e) => setProfile({ ...profile, fitness_goal: e.target.value as AthleteProfileInput['fitness_goal'] })}>
                    <option value="" disabled>Choose a goal</option>
                    <option value="strength">Build strength</option>
                    <option value="muscle">Build muscle</option>
                    <option value="mobility">Improve mobility</option>
                    <option value="general_fitness">General fitness</option>
                  </select>
                </div>
                <div className="profile-field">
                  <label htmlFor="experience">Experience *</label>
                  <select id="experience" required value={profile.experience_level || ''}
                    onChange={(e) => setProfile({ ...profile, experience_level: e.target.value as AthleteProfileInput['experience_level'] })}>
                    <option value="" disabled>Choose a level</option>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div className="profile-field">
                  <label htmlFor="weekly-target">Weekly workout target *</label>
                  <input id="weekly-target" required type="number" min="1" max="14"
                    value={profile.weekly_workout_target ?? ''}
                    onChange={(e) => setProfile({ ...profile, weekly_workout_target: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="profile-field">
                  <label htmlFor="units">Preferred units *</label>
                  <select id="units" value={profile.preferred_units}
                    onChange={(e) => setProfile({ ...profile, preferred_units: e.target.value as 'metric' | 'imperial' })}>
                    <option value="metric">Metric</option>
                    <option value="imperial">Imperial</option>
                  </select>
                </div>
                {profile.preferred_units === 'metric' ? (
                  <div className="profile-field">
                    <label htmlFor="height">Height in centimetres</label>
                    <input id="height" type="number" min="100" max="250" step="0.1" value={profile.height_cm ?? ''}
                      onChange={(e) => setProfile({ ...profile, height_cm: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                ) : (
                  <div className="profile-field">
                    <label>Height in feet and inches</label>
                    <div className="imperial-height">
                      <label><span>ft</span><input aria-label="Height feet" type="number" min="3" max="8" step="1" value={heightFeet}
                        onChange={(e) => setImperialHeight(e.target.value ? Number(e.target.value) : '', heightInches)} /></label>
                      <label><span>in</span><input aria-label="Height inches" type="number" min="0" max="11.9" step="0.1" value={heightInches}
                        onChange={(e) => setImperialHeight(heightFeet, e.target.value ? Number(e.target.value) : '')} /></label>
                    </div>
                  </div>
                )}
                <div className="profile-field">
                  <label htmlFor="weight">Weight in {profile.preferred_units === 'metric' ? 'kilograms' : 'pounds'}</label>
                  <input id="weight" type="number"
                    min={profile.preferred_units === 'metric' ? 30 : 66}
                    max={profile.preferred_units === 'metric' ? 350 : 772}
                    step="0.1"
                    value={profile.preferred_units === 'metric' ? (profile.weight_kg ?? '') : weightPounds}
                    onChange={(e) => setProfile({
                      ...profile,
                      weight_kg: e.target.value
                        ? Number(e.target.value) / (profile.preferred_units === 'metric' ? 1 : 2.2046226218)
                        : null,
                    })} />
                </div>
              </div>
              {error && <div className="notice error" role="alert">{error}</div>}
              {saved && <div className="notice success" role="status"><Check size={16} /> Profile saved.</div>}
              <div className="profile-actions">
                <p><LockKeyhole size={14} /> Only your signed-in account can access this profile.</p>
                <Button type="submit" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save profile'}</Button>
              </div>
            </>
          )}
        </form>
        <aside className="panel profile-aside">
          <span className="eyebrow">WHAT THIS CHANGES</span>
          <h2>A better baseline for every session.</h2>
          <p>Your goal and experience give future coaching and insights useful context. Height and weight are optional.</p>
          <div className="profile-data-row"><span>Identity</span><strong>Auth0</strong></div>
          <div className="profile-data-row"><span>Profile</span><strong>Tiger PostgreSQL</strong></div>
          <div className="profile-data-row"><span>Camera video</span><strong>Never uploaded</strong></div>
        </aside>
      </div>
    </div>
  );
}
