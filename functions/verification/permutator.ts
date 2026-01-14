/**
 * Email Permutation Engine
 * Generates a list of potential email addresses based on a person's name and company domain.
 */

export interface PermutationInput {
    firstName: string;
    lastName: string;
    domain: string;
}

export function generateEmailPermutations(input: PermutationInput): string[] {
    const { firstName, lastName, domain } = input;
    const f = firstName.toLowerCase().trim();
    const l = lastName.toLowerCase().trim();
    const d = domain.toLowerCase().trim();

    if (!f || !l || !d) return [];

    const fi = f.charAt(0); // First initial
    const li = l.charAt(0); // Last initial

    // Common corporate email patterns ordered by probability
    const permutations = [
        `${f}.${l}@${d}`,       // john.doe@nike.com (Most common)
        `${fi}${l}@${d}`,       // jdoe@nike.com
        `${f}@${d}`,            // john@nike.com
        `${f}${l}@${d}`,        // johndoe@nike.com
        `${l}.${f}@${d}`,       // doe.john@nike.com
        `${f}_${l}@${d}`,       // john_doe@nike.com
        `${fi}.${l}@${d}`,      // j.doe@nike.com
        `${l}${f}@${d}`,        // doejohn@nike.com
        `${f}${li}@${d}`,       // johnd@nike.com
    ];

    return permutations;
}
