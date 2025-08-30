import { useEffect, useState } from "react";

/**
 * Debounce any primitive value (string/number/boolean).
 * Returns the debounced value after `delay` ms of no changes.
 */
export default function useDebounce(value, delay = 150) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
